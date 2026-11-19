import { readdirSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { ulid } from 'ulid';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/database/prisma.service';
import { setupApplication } from '@/core/app.setup';
import type {
  CheckoutPreviewResponseDto,
  VnpayPlaceOrderResponseDto,
  PlaceOrderResponseDto,
} from '@/modules/checkout/dto';
import type {
  FlashSaleResponseDto,
  SaveFlashSaleDto,
} from '@/modules/flash-sales/flash-sales.dto';
import { CouponsExpiryService } from '@/modules/coupons/coupons-expiry.service';
import { seedCatalog, ROLE_IDS } from '../prisma/catalog.seed';
import {
  createDisposablePostgresDatabase,
  readMigrationSql,
  type DisposablePostgresDatabase,
} from './helpers/postgres-test-database';

describe('Flash Sale HTTP + PostgreSQL atomic lifecycle', () => {
  jest.setTimeout(120000);
  let database: DisposablePostgresDatabase,
    prisma: PrismaService,
    app: INestApplication<App>;
  let admin: string[];
  const customers: Array<{
    id: string;
    cookies: string[];
    cartId: string;
    addressId: string;
  }> = [];
  const branches: string[] = [];
  const denied: string[][] = [];
  const csrf = 'flash-sale-test-csrf-01234567890123456789';
  beforeAll(async () => {
    database = await createDisposablePostgresDatabase('flash_sale_http');
    for (const migration of readdirSync('prisma/migrations')
      .filter((n) => /^\d/.test(n))
      .sort())
      await database.runSql(readMigrationSql(migration));
    prisma = new PrismaService({
      getOrThrow: () => database.databaseUrl,
      get: () => 'test',
    } as unknown as ConfigService);
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = module.createNestApplication({ logger: false });
    setupApplication(app);
    await app.init();
    await prisma.$transaction((tx) => seedCatalog(tx));
    for (let n = 0; n < 2; n++)
      branches.push(
        (
          await prisma.branch.create({
            data: {
              name: `Flash branch ${n}`,
              code: ulid(),
              address: 'Cần Thơ',
              province: 'Thành phố Cần Thơ',
              ward: 'Phường Ninh Kiều',
            },
          })
        ).id,
      );
    const jwt = new JwtService(),
      secret = app
        .get(ConfigService)
        .getOrThrow<string>('auth.jwt.accessSecret');
    async function cookies(userId: string) {
      const session = await prisma.authSession.create({
        data: {
          userId,
          refreshTokenHash: ulid(),
          expiresAt: new Date(Date.now() + 3600000),
        },
      });
      return [
        `accessToken=${jwt.sign({ sub: userId, sid: session.id }, { secret, expiresIn: '1h' })}`,
        `csrfToken=${csrf}`,
      ];
    }
    const user = await prisma.user.create({
      data: {
        email: `${ulid()}@flash.test`,
        type: 'SYSTEM',
        userRoles: { create: { roleId: ROLE_IDS.SUPER_ADMIN } },
      },
    });
    admin = await cookies(user.id);
    for (let n = 0; n < 3; n++) {
      const owner = await prisma.user.create({
        data: { email: `${ulid()}@flash.test`, type: 'CUSTOMER' },
      });
      const cart = await prisma.cart.create({
        data: { userId: owner.id, branchId: branches[n % 2] },
      });
      const address = await prisma.userAddress.create({
        data: {
          userId: owner.id,
          receiverName: 'Khách Flash',
          receiverPhone: '0900000000',
          detail: 'Số 1 đường kiểm thử',
          province: 'Thành phố Cần Thơ',
          provinceCode: 92,
          ward: 'Phường Ninh Kiều',
          wardCode: 31135,
        },
      });
      customers.push({
        id: owner.id,
        cookies: await cookies(owner.id),
        cartId: cart.id,
        addressId: address.id,
      });
    }
    denied.push(customers[0].cookies);
    for (const roleId of [
      ROLE_IDS.BRANCH_ADMIN,
      ROLE_IDS.STAFF,
      ROLE_IDS.CASHIER,
    ]) {
      const branchUser = await prisma.user.create({
        data: {
          email: `${ulid()}@flash.test`,
          type: 'BRANCH',
          userBranches: {
            create: {
              branchId: branches[0],
              isPrimary: true,
              roles: { create: { roleId } },
            },
          },
        },
      });
      denied.push(await cookies(branchUser.id));
    }
  });
  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    await database?.close();
  });
  const post = (
    url: string,
    data: object,
    cookie = admin,
    branchId = branches[0],
  ) =>
    request(app.getHttpServer())
      .post(`/api/v1${url}`)
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrf)
      .set('X-Branch-Id', branchId)
      .send(data);
  const patch = (url: string, data: object) =>
    request(app.getHttpServer())
      .patch(`/api/v1${url}`)
      .set('Cookie', admin)
      .set('X-CSRF-Token', csrf)
      .send(data);
  async function fixture(
    quota = 5,
    limit = 3,
    startOffset = -60000,
    endOffset = 3600000,
  ) {
    const product = await prisma.product.create({
      data: {
        name: 'Sách Flash kiểm thử',
        slug: ulid().toLowerCase(),
        status: 'ACTIVE',
        variants: {
          create: {
            name: 'Bìa mềm',
            sku: ulid(),
            combinationKey: 'default',
            weightGram: 350,
            originalPrice: 100000,
            salePrice: 80000,
            isDefault: true,
          },
        },
      },
      include: { variants: true },
    });
    const variant = product.variants[0];
    for (const branchId of branches)
      await prisma.branchProductStock.create({
        data: { branchId, variantId: variant.id, quantity: 5 },
      });
    const dto: SaveFlashSaleDto = {
      name: 'Flash kiểm thử',
      startAt: new Date(Date.now() + startOffset).toISOString(),
      endAt: new Date(Date.now() + endOffset).toISOString(),
      items: [
        {
          variantId: variant.id,
          flashPrice: 60000,
          totalQuota: quota,
          maxQuantityPerUser: limit,
        },
      ],
    };
    const created = await post('/admin/flash-sales', dto).expect(201);
    const sale = (created.body as { data: FlashSaleResponseDto }).data;
    return { variant, sale, dto };
  }
  async function publish(id: string) {
    return post(`/admin/flash-sales/${id}/control`, {
      action: 'publish',
    }).expect(201);
  }
  async function prepare(
    variantId: string,
    index = 0,
    quantity = 1,
    method: 'COD' | 'VNPAY' = 'COD',
    regular = false,
  ) {
    const customer = customers[index];
    const item = await prisma.cartItem.upsert({
      where: { cartId_variantId: { cartId: customer.cartId, variantId } },
      update: { quantity },
      create: {
        cartId: customer.cartId,
        variantId,
        quantity,
        lastKnownUnitPrice: 80000,
      },
    });
    const cart = await prisma.cart.findUniqueOrThrow({
      where: { id: customer.cartId },
    });
    const input = {
      selectedCartItemIds: [item.id],
      address: {
        source: 'SAVED_ADDRESS' as const,
        customerAddressId: customer.addressId,
      },
      paymentMethod: method,
      ...(regular ? { regularPriceCartItemIds: [item.id] } : {}),
    };
    const preview = await post(
      '/checkout/preview',
      input,
      customer.cookies,
      cart.branchId,
    ).expect(201);
    return {
      input,
      data: (preview.body as { data: CheckoutPreviewResponseDto }).data,
      customer,
      branchId: cart.branchId,
      item,
    };
  }
  async function place(prepared: Awaited<ReturnType<typeof prepare>>) {
    return post(
      `/checkout/place-order/${prepared.input.paymentMethod === 'COD' ? 'cod' : 'vnpay'}`,
      {
        ...prepared.input,
        previewReference: prepared.data.previewReference,
        idempotencyKey: ulid(),
      },
      prepared.customer.cookies,
      prepared.branchId,
    );
  }
  function signed(
    transaction: { merchantTxnRef: string; amount: unknown },
    overrides: Record<string, string> = {},
  ) {
    const config = app.get(ConfigService);
    const params: Record<string, string> = {
      vnp_TmnCode: config.getOrThrow<string>('payment.vnpay.tmnCode'),
      vnp_TxnRef: transaction.merchantTxnRef,
      vnp_Amount: String(Number(transaction.amount) * 100),
      vnp_ResponseCode: '00',
      vnp_TransactionStatus: '00',
      vnp_TransactionNo: ulid(),
      vnp_CurrCode: 'VND',
      ...overrides,
    };
    const canonical = Object.keys(params)
      .sort()
      .map(
        (k) =>
          `${encodeURIComponent(k)}=${encodeURIComponent(params[k]).replace(/%20/g, '+')}`,
      )
      .join('&');
    return {
      ...params,
      vnp_SecureHash: createHmac(
        'sha512',
        config.getOrThrow<string>('payment.vnpay.hashSecret'),
      )
        .update(canonical)
        .digest('hex'),
    };
  }
  const callback = (query: Record<string, string>) =>
    request(app.getHttpServer())
      .get('/api/v1/payments/vnpay/ipn')
      .query(query)
      .expect(200);

  it('enforces SUPER_ADMIN and CSRF on direct APIs', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/flash-sales')
      .expect(401);
    for (const cookie of denied) {
      await request(app.getHttpServer())
        .get('/api/v1/admin/flash-sales')
        .set('Cookie', cookie)
        .expect(403);
      await post('/admin/flash-sales', {}, cookie).expect(403);
    }
    await request(app.getHttpServer())
      .post('/api/v1/admin/flash-sales')
      .set('Cookie', admin)
      .send({})
      .expect(403);
  });
  it('rejects quota above global available stock, duplicate variants, invalid prices and limits', async () => {
    const { dto } = await fixture();
    for (const change of [
      { totalQuota: 11 },
      { flashPrice: 80000 },
      { maxQuantityPerUser: 6 },
      { flashPrice: 0 },
      { totalQuota: 0 },
    ])
      await post('/admin/flash-sales', {
        ...dto,
        items: [{ ...dto.items[0], ...change }],
      }).expect(400);
    await post('/admin/flash-sales', {
      ...dto,
      items: [dto.items[0], dto.items[0]],
    }).expect(400);
  });
  it('lists upcoming previews without applying their price and hides private or unavailable campaigns', async () => {
    const { sale, variant } = await fixture(5, 2, 3600000, 7200000);
    await publish(sale.id);
    const upcoming = await request(app.getHttpServer())
      .get('/api/v1/storefront/flash-sales')
      .query({ status: 'SCHEDULED' })
      .expect(200);
    const rows = (upcoming.body as { data: { items: FlashSaleResponseDto[] } })
      .data.items;
    expect(
      rows.some((row) => row.id === sale.id && row.status === 'SCHEDULED'),
    ).toBe(true);
    const prepared = await prepare(variant.id);
    expect(prepared.data.items[0].unitPrice).toBe(80000);
    expect(prepared.data.items[0].flashSaleItemId).toBeNull();
    const drafts = await request(app.getHttpServer())
      .get('/api/v1/storefront/flash-sales')
      .query({ status: 'DRAFT' })
      .expect(200);
    expect((drafts.body as { data: { items: unknown[] } }).data.items).toEqual(
      [],
    );
    await prisma.productVariant.update({
      where: { id: variant.id },
      data: { isActive: false },
    });
    const hidden = await request(app.getHttpServer())
      .get('/api/v1/storefront/flash-sales')
      .query({ status: 'SCHEDULED' })
      .expect(200);
    expect(
      (
        hidden.body as { data: { items: FlashSaleResponseDto[] } }
      ).data.items.some((row) => row.id === sale.id),
    ).toBe(false);
  });
  it('revalidates stock on publication; ignores inactive branches', async () => {
    const { sale, variant } = await fixture(10, 2);
    await prisma.branchProductStock.updateMany({
      where: { variantId: variant.id, branchId: branches[1] },
      data: { quantity: 4 },
    });
    const rejected = await post(`/admin/flash-sales/${sale.id}/control`, {
      action: 'publish',
    }).expect(400);
    expect(rejected.body).toMatchObject({
      code: 'FLASH_SALE_QUOTA_EXCEEDS_STOCK',
    });
    await prisma.branch.update({
      where: { id: branches[1] },
      data: { isActive: false },
    });
    const summary = await request(app.getHttpServer())
      .get('/api/v1/admin/flash-sales/variants')
      .query({ search: variant.sku })
      .set('Cookie', admin)
      .expect(200);
    expect(
      (
        summary.body as {
          data: { items: Array<{ globalAvailableStock: number }> };
        }
      ).data.items[0].globalAvailableStock,
    ).toBe(5);
    await prisma.branch.update({
      where: { id: branches[1] },
      data: { isActive: true },
    });
  });
  it('serializes competing publications, rejects overlaps, accepts adjacent periods and locks active edits', async () => {
    const { sale, dto } = await fixture();
    const other = await post('/admin/flash-sales', dto).expect(201);
    const otherId = (other.body as { data: FlashSaleResponseDto }).data.id;
    const results = await Promise.all([
      post(`/admin/flash-sales/${sale.id}/control`, { action: 'publish' }),
      post(`/admin/flash-sales/${otherId}/control`, { action: 'publish' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const publishedId = results[0].status === 201 ? sale.id : otherId;
    await patch(`/admin/flash-sales/${publishedId}`, dto).expect(409);
    const adjacent = await post('/admin/flash-sales', {
      ...dto,
      startAt: dto.endAt,
      endAt: new Date(Date.parse(dto.endAt) + 3600000).toISOString(),
    }).expect(201);
    await publish((adjacent.body as { data: FlashSaleResponseDto }).data.id);
  });
  it('quotes cart Flash Sale prices consistently with preview and COD snapshot without reserving', async () => {
    const { sale, variant } = await fixture(5, 3);
    await publish(sale.id);
    const prepared = await prepare(variant.id, 0, 2);
    const response = await request(app.getHttpServer())
      .get('/api/v1/cart')
      .set('Cookie', prepared.customer.cookies)
      .set('X-Branch-Id', prepared.branchId)
      .expect(200);
    const row = (
      response.body as {
        data: {
          items: Array<{
            productVariantId: string;
            currentUnitPrice: number;
            lineSubtotal: number;
          }>;
        };
      }
    ).data.items.find((i) => i.productVariantId === variant.id)!;
    expect(row.currentUnitPrice).toBe(60000);
    expect(row.lineSubtotal).toBe(120000);
    expect(prepared.data.items[0].unitPrice).toBe(row.currentUnitPrice);
    expect(
      await prisma.flashSaleAllocation.count({
        where: { flashSaleItemId: sale.items[0].id },
      }),
    ).toBe(0);
    const placed = await place(prepared);
    expect(placed.status).toBe(201);
    const orderId = (placed.body as { data: PlaceOrderResponseDto }).data
      .orderId;
    const snapshot = await prisma.orderItem.findFirstOrThrow({
      where: { orderId },
    });
    expect(Number(snapshot.unitPrice)).toBe(60000);
  });
  it('does not quote Flash Sale for excess quantity, unavailable branch stock, cheaper catalog or stopped campaigns', async () => {
    const { sale, variant } = await fixture(5, 2);
    await publish(sale.id);
    const prepared = await prepare(variant.id);
    async function row() {
      const response = await request(app.getHttpServer())
        .get('/api/v1/cart')
        .set('Cookie', prepared.customer.cookies)
        .set('X-Branch-Id', prepared.branchId)
        .expect(200);
      return (
        response.body as {
          data: {
            items: Array<{
              productVariantId: string;
              currentUnitPrice: number;
              message: string;
              isCheckoutEligible: boolean;
            }>;
          };
        }
      ).data.items.find((i) => i.productVariantId === variant.id)!;
    }
    await prisma.cartItem.update({
      where: { id: prepared.item.id },
      data: { quantity: 3 },
    });
    expect((await row()).currentUnitPrice).toBe(80000);
    expect((await row()).message).toContain('Số lượng vượt suất');
    await prisma.cartItem.update({
      where: { id: prepared.item.id },
      data: { quantity: 1 },
    });
    await prisma.branchProductStock.updateMany({
      where: { variantId: variant.id, branchId: prepared.branchId },
      data: { quantity: 0 },
    });
    expect((await row()).isCheckoutEligible).toBe(false);
    expect((await row()).currentUnitPrice).toBe(80000);
    await prisma.branchProductStock.updateMany({
      where: { variantId: variant.id, branchId: prepared.branchId },
      data: { quantity: 5 },
    });
    await prisma.productVariant.update({
      where: { id: variant.id },
      data: { salePrice: 50000 },
    });
    expect((await row()).currentUnitPrice).toBe(50000);
    await prisma.productVariant.update({
      where: { id: variant.id },
      data: { salePrice: 80000 },
    });
    await post(`/admin/flash-sales/${sale.id}/control`, {
      action: 'stop',
      reason: 'Kiểm thử dừng chương trình',
    }).expect(201);
    expect((await row()).currentUnitPrice).toBe(80000);
    expect(
      await prisma.flashSaleAllocation.count({
        where: { flashSaleItemId: sale.items[0].id },
      }),
    ).toBe(0);
  });
  it('keeps fixed VND, avoids double discounts, and falls back to cheaper catalog without consuming quota', async () => {
    const { sale, variant } = await fixture();
    await publish(sale.id);
    await prisma.productVariant.update({
      where: { id: variant.id },
      data: { salePrice: 70000 },
    });
    let prepared = await prepare(variant.id);
    expect(prepared.data.items[0].unitPrice).toBe(60000);
    await prisma.productVariant.update({
      where: { id: variant.id },
      data: { salePrice: 50000 },
    });
    prepared = await prepare(variant.id);
    expect(prepared.data.items[0].unitPrice).toBe(50000);
    const order = await place(prepared);
    expect(order.status).toBe(201);
    expect(
      await prisma.flashSaleAllocation.count({
        where: {
          orderId: (order.body as { data: PlaceOrderResponseDto }).data.orderId,
        },
      }),
    ).toBe(0);
    expect(
      Number(
        (
          await prisma.flashSaleItem.findUniqueOrThrow({
            where: { id: sale.items[0].id },
          })
        ).flashPrice,
      ),
    ).toBe(60000);
  });
  it('preview reserves nothing; shared quota and per-user limits span branches; COD cancel releases once', async () => {
    const { sale, variant } = await fixture(4, 2);
    await publish(sale.id);
    const prepared = await prepare(variant.id, 0, 2);
    expect(prepared.data.subtotalAmount).toBe(120000);
    expect(
      await prisma.flashSaleAllocation.count({
        where: { flashSaleItemId: sale.items[0].id },
      }),
    ).toBe(0);
    const order = await place(prepared);
    expect(order.status).toBe(201);
    const orderId = (order.body as { data: PlaceOrderResponseDto }).data
      .orderId;
    const before = await prisma.branchProductStock.findMany({
      where: { variantId: variant.id },
      orderBy: { branchId: 'asc' },
    });
    expect(before.find((s) => s.branchId === prepared.branchId)?.quantity).toBe(
      3,
    );
    expect(before.find((s) => s.branchId !== prepared.branchId)?.quantity).toBe(
      5,
    );
    await prisma.cart.update({
      where: { id: prepared.customer.cartId },
      data: { branchId: branches[1] },
    });
    const item = await prisma.cartItem.create({
      data: {
        cartId: prepared.customer.cartId,
        variantId: variant.id,
        quantity: 1,
        lastKnownUnitPrice: 80000,
      },
    });
    const limited = await post(
      '/checkout/preview',
      { ...prepared.input, selectedCartItemIds: [item.id] },
      prepared.customer.cookies,
      branches[1],
    ).expect(409);
    expect(limited.body).toMatchObject({
      code: 'FLASH_SALE_USER_LIMIT',
      details: { allowedQuantity: 0 },
    });
    const regular = await prepare(variant.id, 0, 1, 'COD', true);
    expect(regular.data.items[0].unitPrice).toBe(80000);
    for (let n = 0; n < 2; n++)
      await post(
        `/customer/orders/${orderId}/cancel`,
        { reason: 'Kiểm thử hoàn suất' },
        prepared.customer.cookies,
        branches[1],
      );
    expect(
      (
        await prisma.flashSaleAllocation.findFirstOrThrow({
          where: { orderId },
        })
      ).status,
    ).toBe('RELEASED');
    expect(
      (
        await prisma.branchProductStock.findUniqueOrThrow({
          where: {
            branchId_variantId: {
              branchId: prepared.branchId,
              variantId: variant.id,
            },
          },
        })
      ).quantity,
    ).toBe(5);
    await prisma.cart.update({
      where: { id: prepared.customer.cartId },
      data: { branchId: branches[0] },
    });
  });
  it('two customers racing the last slot yield exactly one allocation and one order', async () => {
    const { sale, variant } = await fixture(1, 1);
    await publish(sale.id);
    const one = await prepare(variant.id, 0),
      two = await prepare(variant.id, 1);
    const results = await Promise.all([place(one), place(two)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(
      (
        await prisma.flashSaleAllocation.aggregate({
          where: { flashSaleItemId: sale.items[0].id, status: 'CONSUMED' },
          _sum: { quantity: true },
        })
      )._sum.quantity,
    ).toBe(1);
  });
  it('same-account concurrent checkout cannot exceed its per-user limit', async () => {
    const { sale, variant } = await fixture(5, 1);
    await publish(sale.id);
    const prepared = await prepare(variant.id);
    const results = await Promise.all([place(prepared), place(prepared)]);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(
      (
        await prisma.flashSaleAllocation.aggregate({
          where: {
            flashSaleItemId: sale.items[0].id,
            userId: prepared.customer.id,
          },
          _sum: { quantity: true },
        })
      )._sum.quantity,
    ).toBe(1);
  });
  it('combines ORDER and SHIPPING coupons after Flash Sale with exact snapshots', async () => {
    const { sale, variant } = await fixture();
    await publish(sale.id);
    for (const [code, type, value] of [
      ['FLASHORDER', 'ORDER', 10],
      ['FLASHSHIP', 'SHIPPING', 50],
    ] as const)
      await prisma.coupon.create({
        data: {
          code,
          name: code,
          type,
          visibility: 'PRIVATE',
          discountType: 'PERCENTAGE',
          discountValue: value,
          minOrderAmount: 60000,
          startAt: new Date(Date.now() - 60000),
          endAt: new Date(Date.now() + 3600000),
        },
      });
    const prepared = await prepare(variant.id);
    const input = {
      ...prepared.input,
      orderCouponCode: 'FLASHORDER',
      shippingCouponCode: 'FLASHSHIP',
    };
    const response = await post(
      '/checkout/preview',
      input,
      prepared.customer.cookies,
      prepared.branchId,
    ).expect(201);
    const data = (response.body as { data: CheckoutPreviewResponseDto }).data;
    expect(data.subtotalAmount).toBe(60000);
    expect(data.orderCouponDiscountAmount).toBe(6000);
    expect(data.shippingCouponDiscountAmount).toBe(data.shippingFee! / 2);
    const result = await post(
      '/checkout/place-order/cod',
      {
        ...input,
        previewReference: data.previewReference,
        idempotencyKey: ulid(),
      },
      prepared.customer.cookies,
      prepared.branchId,
    ).expect(201);
    const orderId = (result.body as { data: PlaceOrderResponseDto }).data
      .orderId;
    const snapshot = await prisma.orderItem.findFirstOrThrow({
      where: { orderId },
    });
    expect([
      Number(snapshot.originalPrice),
      Number(snapshot.catalogEffectivePrice),
      Number(snapshot.flashPrice),
      Number(snapshot.unitPrice),
      Number(snapshot.couponDiscountAmount),
    ]).toEqual([100000, 80000, 60000, 60000, 6000]);
  });
  it('reserves VNPAY once, retries after stop, consumes duplicate verified callbacks once and preserves snapshot', async () => {
    const { sale, variant } = await fixture();
    await publish(sale.id);
    const prepared = await prepare(variant.id, 1, 1, 'VNPAY');
    const created = await place(prepared);
    expect(created.status).toBe(201);
    const order = (created.body as { data: VnpayPlaceOrderResponseDto }).data;
    const original = await prisma.paymentTransaction.findUniqueOrThrow({
      where: { id: order.paymentTransactionId },
    });
    expect(
      (
        await prisma.flashSaleAllocation.findFirstOrThrow({
          where: { orderId: order.orderId },
        })
      ).status,
    ).toBe('RESERVED');
    await callback(
      signed(original, { vnp_ResponseCode: '24', vnp_TransactionStatus: '02' }),
    );
    await post(`/admin/flash-sales/${sale.id}/control`, {
      action: 'stop',
    }).expect(201);
    const retry = await post(
      `/payments/${order.paymentId}/retry`,
      { idempotencyKey: ulid() },
      prepared.customer.cookies,
      prepared.branchId,
    ).expect(201);
    const next = await prisma.paymentTransaction.findUniqueOrThrow({
      where: {
        id: (retry.body as { data: { paymentTransactionId: string } }).data
          .paymentTransactionId,
      },
    });
    expect(Number(next.amount)).toBe(prepared.data.totalAmount);
    const query = signed(next);
    for (let n = 0; n < 2; n++)
      expect((await callback(query)).body).toMatchObject({ RspCode: '00' });
    const allocations = await prisma.flashSaleAllocation.findMany({
      where: { orderId: order.orderId },
    });
    expect(allocations).toHaveLength(1);
    expect(allocations[0].status).toBe('CONSUMED');
  });
  it('expiry without coupons releases allocation and stock; late callback cannot revive order', async () => {
    const { sale, variant } = await fixture();
    await publish(sale.id);
    const prepared = await prepare(variant.id, 2, 1, 'VNPAY');
    const created = await place(prepared);
    expect(created.status).toBe(201);
    const order = (created.body as { data: VnpayPlaceOrderResponseDto }).data;
    const attempt = await prisma.paymentTransaction.findUniqueOrThrow({
      where: { id: order.paymentTransactionId },
    });
    await prisma.flashSaleAllocation.updateMany({
      where: { orderId: order.orderId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await app.get(CouponsExpiryService).cleanup();
    expect(
      (await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } }))
        .status,
    ).toBe('CANCELLED');
    expect(
      (
        await prisma.flashSaleAllocation.findFirstOrThrow({
          where: { orderId: order.orderId },
        })
      ).status,
    ).toBe('RELEASED');
    expect((await callback(signed(attempt))).body).toMatchObject({
      RspCode: '02',
    });
    expect(
      (await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } }))
        .status,
    ).toBe('CANCELLED');
    expect(
      (
        await prisma.branchProductStock.findUniqueOrThrow({
          where: {
            branchId_variantId: {
              branchId: prepared.branchId,
              variantId: variant.id,
            },
          },
        })
      ).quantity,
    ).toBe(5);
  });
  it('stale preview after stop or campaign end creates no order or allocation', async () => {
    const { sale, variant } = await fixture();
    await publish(sale.id);
    const prepared = await prepare(variant.id, 2);
    await post(`/admin/flash-sales/${sale.id}/control`, {
      action: 'stop',
    }).expect(201);
    const before = await prisma.order.count();
    const result = await place(prepared);
    expect(result.status).toBe(409);
    expect(result.body).toMatchObject({ code: 'CHECKOUT_PREVIEW_CHANGED' });
    expect(await prisma.order.count()).toBe(before);
    expect(
      await prisma.flashSaleAllocation.count({
        where: { flashSaleItemId: sale.items[0].id },
      }),
    ).toBe(0);
  });
});
