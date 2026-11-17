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
  PlaceOrderResponseDto,
  VnpayPlaceOrderResponseDto,
} from '@/modules/checkout/dto';
import type {
  CouponResponseDto,
  SaveCouponDto,
} from '@/modules/coupons/coupons.dto';
import { CouponsExpiryService } from '@/modules/coupons/coupons-expiry.service';
import { seedCatalog, ROLE_IDS } from '../prisma/catalog.seed';
import { seedDemoCoupons } from '../prisma/seed/coupons.seed';
import {
  createDisposablePostgresDatabase,
  readMigrationSql,
  type DisposablePostgresDatabase,
} from './helpers/postgres-test-database';

describe('Coupon HTTP authorization, checkout and VNPAY lifecycle', () => {
  jest.setTimeout(120000);
  let database: DisposablePostgresDatabase;
  let prisma: PrismaService;
  let app: INestApplication<App>;
  let admin: string[];
  let customer: string[];
  const denied: string[][] = [];
  let branchId: string;
  let userId: string;
  let variantId: string;
  let cartId: string;
  let addressId: string;
  const csrf = 'coupon-http-csrf-01234567890123456789';
  const code = 'HTTPBOOK';
  let managed: CouponResponseDto;
  beforeAll(async () => {
    database = await createDisposablePostgresDatabase('coupon_http');
    for (const migration of readdirSync('prisma/migrations')
      .filter((name) => /^\d/.test(name))
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
    await prisma.$transaction(async (tx) => {
      await seedCatalog(tx);
      await seedDemoCoupons(tx);
    });
    const superUser = await prisma.user.create({
      data: {
        email: `${ulid()}@coupon.test`,
        type: 'SYSTEM',
        userRoles: { create: { roleId: ROLE_IDS.SUPER_ADMIN } },
      },
    });
    const owner = await prisma.user.create({
      data: { email: `${ulid()}@coupon.test`, type: 'CUSTOMER' },
    });
    userId = owner.id;
    const branch = await prisma.branch.create({
      data: {
        name: 'Coupon test',
        code: ulid(),
        address: 'Cần Thơ',
        province: 'Thành phố Cần Thơ',
        ward: 'Phường Ninh Kiều',
      },
    });
    branchId = branch.id;
    const product = await prisma.product.create({
      data: {
        name: 'Coupon fixture',
        slug: ulid().toLowerCase(),
        status: 'ACTIVE',
        variants: {
          create: {
            name: 'Bản mềm',
            sku: ulid(),
            combinationKey: 'default',
            weightGram: 350,
            originalPrice: 80000,
            salePrice: 72000,
            isDefault: true,
          },
        },
      },
      include: { variants: true },
    });
    variantId = product.variants[0].id;
    await prisma.branchProductStock.create({
      data: { branchId, variantId, quantity: 100 },
    });
    cartId = (await prisma.cart.create({ data: { userId, branchId } })).id;
    addressId = (
      await prisma.userAddress.create({
        data: {
          userId,
          receiverName: 'Coupon tester',
          receiverPhone: '0900000000',
          detail: 'Số 1 đường kiểm thử',
          province: 'Thành phố Cần Thơ',
          provinceCode: 92,
          ward: 'Phường Ninh Kiều',
          wardCode: 31135,
        },
      })
    ).id;
    const jwt = new JwtService();
    const secret = app
      .get(ConfigService)
      .getOrThrow<string>('auth.jwt.accessSecret');
    const cookies = async (id: string) => {
      const session = await prisma.authSession.create({
        data: {
          userId: id,
          refreshTokenHash: ulid(),
          expiresAt: new Date(Date.now() + 3600000),
        },
      });
      return [
        `accessToken=${jwt.sign({ sub: id, sid: session.id }, { secret, expiresIn: '1h' })}`,
        `csrfToken=${csrf}`,
      ];
    };
    admin = await cookies(superUser.id);
    customer = await cookies(userId);
    denied.push(customer);
    for (const roleId of [
      ROLE_IDS.BRANCH_ADMIN,
      ROLE_IDS.STAFF,
      ROLE_IDS.CASHIER,
    ]) {
      const user = await prisma.user.create({
        data: {
          email: `${ulid()}@coupon.test`,
          type: 'BRANCH',
          userBranches: {
            create: {
              branchId,
              isPrimary: true,
              roles: { create: { roleId } },
            },
          },
        },
      });
      denied.push(await cookies(user.id));
    }
  });
  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    await database?.close();
  });
  const body = (): SaveCouponDto => ({
    code,
    name: 'Ưu đãi kiểm thử',
    type: 'ORDER',
    visibility: 'PRIVATE',
    discountType: 'FIXED_AMOUNT',
    discountValue: 5000,
    usageLimit: 100,
    usageLimitPerUser: 20,
    startAt: new Date(Date.now() - 60000).toISOString(),
    endAt: new Date(Date.now() + 86400000).toISOString(),
    isActive: true,
  });
  const post = (url: string, payload: object, cookie = customer) =>
    request(app.getHttpServer())
      .post(`/api/v1${url}`)
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrf)
      .set('X-Branch-Id', branchId)
      .send(payload);
  async function preview(
    paymentMethod: 'COD' | 'VNPAY' = 'COD',
    orderCouponCode = code,
  ): Promise<{
    input: {
      selectedCartItemIds: string[];
      address: { source: 'SAVED_ADDRESS'; customerAddressId: string };
      paymentMethod: 'COD' | 'VNPAY';
      orderCouponCode: string;
    };
    data: CheckoutPreviewResponseDto;
  }> {
    const item = await prisma.cartItem.upsert({
      where: { cartId_variantId: { cartId, variantId } },
      update: {},
      create: { cartId, variantId, quantity: 1, lastKnownUnitPrice: 72000 },
    });
    const input = {
      selectedCartItemIds: [item.id],
      address: {
        source: 'SAVED_ADDRESS' as const,
        customerAddressId: addressId,
      },
      paymentMethod,
      orderCouponCode,
    };
    const result = await post('/checkout/preview', input).expect(201);
    return {
      input,
      data: (result.body as { data: CheckoutPreviewResponseDto }).data,
    };
  }
  function signed(
    transaction: { merchantTxnRef: string; amount: unknown },
    overrides: Record<string, string> = {},
  ): Record<string, string> {
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
        (key) =>
          `${encodeURIComponent(key)}=${encodeURIComponent(params[key]).replace(/%20/g, '+')}`,
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
  it('enforces authentication, exact SUPER_ADMIN, CSRF and global scope regardless of branch header', async () => {
    await request(app.getHttpServer()).get('/api/v1/admin/coupons').expect(401);
    for (const cookie of denied) {
      await request(app.getHttpServer())
        .get('/api/v1/admin/coupons')
        .set('Cookie', cookie)
        .expect(403);
      await post('/admin/coupons', body(), cookie).expect(403);
    }
    await request(app.getHttpServer())
      .post('/api/v1/admin/coupons')
      .set('Cookie', admin)
      .send(body())
      .expect(403);
    const response = await post('/admin/coupons', body(), admin).expect(201);
    managed = (response.body as { data: CouponResponseDto }).data;
    expect(managed.code).toBe(code);
    const list = await request(app.getHttpServer())
      .get('/api/v1/admin/coupons?search=HTTPBOOK')
      .set('Cookie', admin)
      .set('X-Branch-Id', ulid())
      .expect(200);
    expect(
      (list.body as { data: { totalItems: number } }).data.totalItems,
    ).toBe(1);
  });
  it('validates dates, percentages, fractional VND, quota and duplicate normalized code', async () => {
    const sameInstant = body();
    for (const invalid of [
      { ...sameInstant, endAt: sameInstant.startAt },
      { ...body(), discountType: 'PERCENTAGE', discountValue: 101 },
      { ...body(), discountValue: 1.5 },
      { ...body(), usageLimit: 1, usageLimitPerUser: 2 },
      { ...body(), discountValue: -1 },
    ])
      await post('/admin/coupons', invalid, admin).expect(400);
    await post(
      '/admin/coupons',
      { ...body(), code: ' httpbook ' },
      admin,
    ).expect(409);
  });
  it('keeps sale discount informational; COD stores allocation, is idempotent and cancel releases once', async () => {
    const { input, data } = await preview();
    expect(data.subtotalAmount).toBe(72000);
    expect(data.discountAmount).toBe(8000);
    expect(data.totalAmount).toBe(67000 + data.shippingFee!);
    const payload = {
      ...input,
      previewReference: data.previewReference,
      idempotencyKey: ulid(),
    };
    const first = await post('/checkout/place-order/cod', payload).expect(201);
    const order = (first.body as { data: PlaceOrderResponseDto }).data;
    const again = await post('/checkout/place-order/cod', payload).expect(201);
    expect((again.body as { data: PlaceOrderResponseDto }).data.orderId).toBe(
      order.orderId,
    );
    const stored = await prisma.order.findUniqueOrThrow({
      where: { id: order.orderId },
      include: { items: true, couponRedemptions: true },
    });
    expect(Number(stored.items[0].couponDiscountAmount)).toBe(5000);
    expect(stored.couponRedemptions[0].status).toBe('CONSUMED');
    for (let n = 0; n < 2; n++)
      await post(`/customer/orders/${order.orderId}/cancel`, {
        reason: 'Kiểm thử hủy',
      }).expect(201);
    expect(
      (
        await prisma.couponRedemption.findFirstOrThrow({
          where: { orderId: order.orderId },
        })
      ).status,
    ).toBe('RELEASED');
    expect(
      (
        await prisma.branchProductStock.findUniqueOrThrow({
          where: { branchId_variantId: { branchId, variantId } },
        })
      ).quantity,
    ).toBe(100);
  });
  it('rejects a stale coupon rule before final order and snapshots VNPAY without repricing on retry', async () => {
    const { input, data } = await preview('VNPAY');
    await prisma.coupon.update({
      where: { code },
      data: { discountValue: 6000 },
    });
    await post('/checkout/place-order/vnpay', {
      ...input,
      previewReference: data.previewReference,
      idempotencyKey: ulid(),
    }).expect(409);
    const fresh = await preview('VNPAY');
    const created = await post('/checkout/place-order/vnpay', {
      ...fresh.input,
      previewReference: fresh.data.previewReference,
      idempotencyKey: ulid(),
    }).expect(201);
    const result = (created.body as { data: VnpayPlaceOrderResponseDto }).data;
    const transaction = await prisma.paymentTransaction.findUniqueOrThrow({
      where: { id: result.paymentTransactionId },
    });
    expect(
      (
        await prisma.couponRedemption.findFirstOrThrow({
          where: { orderId: result.orderId },
        })
      ).status,
    ).toBe('RESERVED');
    await request(app.getHttpServer())
      .get('/api/v1/payments/vnpay/ipn')
      .query(
        signed(transaction, {
          vnp_ResponseCode: '24',
          vnp_TransactionStatus: '02',
        }),
      )
      .expect(200);
    await prisma.coupon.update({
      where: { code },
      data: { isActive: false, discountValue: 1 },
    });
    const retry = await post(`/payments/${result.paymentId}/retry`, {
      idempotencyKey: ulid(),
    }).expect(201);
    const retryData = (retry.body as { data: { paymentTransactionId: string } })
      .data;
    const next = await prisma.paymentTransaction.findUniqueOrThrow({
      where: { id: retryData.paymentTransactionId },
    });
    const obsolete = await request(app.getHttpServer())
      .get('/api/v1/payments/vnpay/ipn')
      .query(
        signed(transaction, {
          vnp_ResponseCode: '24',
          vnp_TransactionStatus: '02',
        }),
      )
      .expect(200);
    expect(obsolete.body).toMatchObject({ RspCode: '02' });
    expect(
      await prisma.paymentTransaction.findUnique({ where: { id: next.id } }),
    ).toEqual(next);
    expect(Number(next.amount)).toBe(fresh.data.totalAmount);
    expect(
      await prisma.couponRedemption.count({
        where: { orderId: result.orderId },
      }),
    ).toBe(1);
    const invalid = await request(app.getHttpServer())
      .get('/api/v1/payments/vnpay/ipn')
      .query(signed(next, { vnp_Amount: '100' }))
      .expect(200);
    expect(invalid.body).toMatchObject({ RspCode: '04' });
    const callback = signed(next);
    for (let n = 0; n < 2; n++)
      await request(app.getHttpServer())
        .get('/api/v1/payments/vnpay/ipn')
        .query(callback)
        .expect(200);
    const redemption = await prisma.couponRedemption.findFirstOrThrow({
      where: { orderId: result.orderId },
    });
    expect(redemption.status).toBe('CONSUMED');
    expect(Number(redemption.appliedDiscountAmount)).toBe(6000);
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/customer/orders/${result.orderId}`)
      .set('Cookie', customer)
      .expect(200);
    expect(
      (detail.body as { data: { orderCouponDiscountAmount: number } }).data
        .orderCouponDiscountAmount,
    ).toBe(6000);
  });
  it('rejects another order retry key and audits a verified late callback without reviving a canceled coupon order', async () => {
    const foreign = await prisma.paymentTransaction.findFirstOrThrow();
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/coupons/${managed.id}/active`)
      .set('Cookie', admin)
      .set('X-CSRF-Token', csrf)
      .send({ isActive: true })
      .expect(200);
    const { input, data } = await preview('VNPAY');
    const created = await post('/checkout/place-order/vnpay', {
      ...input,
      previewReference: data.previewReference,
      idempotencyKey: ulid(),
    }).expect(201);
    const order = (created.body as { data: VnpayPlaceOrderResponseDto }).data;
    const transaction = await prisma.paymentTransaction.findUniqueOrThrow({
      where: { id: order.paymentTransactionId },
    });
    await request(app.getHttpServer())
      .get('/api/v1/payments/vnpay/ipn')
      .query(
        signed(transaction, {
          vnp_ResponseCode: '24',
          vnp_TransactionStatus: '02',
        }),
      )
      .expect(200);
    await post(`/payments/${order.paymentId}/retry`, {
      idempotencyKey: foreign.idempotencyKey,
    }).expect(409);
    await post(`/customer/orders/${order.orderId}/cancel`, {
      reason: 'Kiểm thử callback muộn',
    }).expect(201);
    const late = await request(app.getHttpServer())
      .get('/api/v1/payments/vnpay/ipn')
      .query(signed(transaction))
      .expect(200);
    expect(late.body).toMatchObject({ RspCode: '02' });
    const stored = await prisma.paymentTransaction.findUniqueOrThrow({
      where: { id: transaction.id },
    });
    expect(stored.secureHashVerified).toBe(true);
    expect(stored.responseCode).toBe('00');
    expect(stored.status).not.toBe('PAID');
    expect(
      (
        await prisma.couponRedemption.findFirstOrThrow({
          where: { orderId: order.orderId },
        })
      ).status,
    ).toBe('RELEASED');
    const savedOrder = await prisma.order.findUniqueOrThrow({
      where: { id: order.orderId },
    });
    expect(savedOrder.status).toBe('CANCELLED');
    expect(Number(savedOrder.totalAmount)).toBe(data.totalAmount);
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/coupons/${managed.id}`)
      .set('Cookie', admin)
      .set('X-CSRF-Token', csrf)
      .send({ ...body(), name: 'Tên sau chỉnh sửa' })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/coupons/${managed.id}`)
      .set('Cookie', admin)
      .set('X-CSRF-Token', csrf)
      .send({ ...body(), code: 'CHANGED_CODE' })
      .expect(409);
  });
  it('rejects zero total after both coupon discounts with no writes and still allows COD', async () => {
    const orderCouponCode = 'HTTPFREEORDER';
    const shippingCouponCode = 'HTTPFREESHIP';
    for (const [freeCode, type] of [
      [orderCouponCode, 'ORDER'],
      [shippingCouponCode, 'SHIPPING'],
    ] as const) {
      await post(
        '/admin/coupons',
        {
          ...body(),
          code: freeCode,
          type,
          discountType: 'PERCENTAGE',
          discountValue: 100,
        },
        admin,
      ).expect(201);
    }
    const { input } = await preview('VNPAY', orderCouponCode);
    const selected = { ...input, shippingCouponCode };
    const previewResponse = await post('/checkout/preview', selected).expect(
      201,
    );
    const data = (previewResponse.body as { data: CheckoutPreviewResponseDto })
      .data;
    expect(data.totalAmount).toBe(0);
    expect(data.orderCouponDiscountAmount).toBe(data.subtotalAmount);
    expect(data.shippingCouponDiscountAmount).toBe(data.shippingFee);
    expect(data.shippingCouponDiscountAmount).toBeGreaterThan(0);
    const snapshot = () =>
      Promise.all([
        prisma.order.count(),
        prisma.payment.count(),
        prisma.paymentTransaction.count(),
        prisma.couponRedemption.count(),
        prisma.inventoryMovement.count(),
        prisma.branchProductStock.findUniqueOrThrow({
          where: { branchId_variantId: { branchId, variantId } },
        }),
        prisma.cartItem.findMany({ where: { cartId }, orderBy: { id: 'asc' } }),
      ]);
    const before = await snapshot();
    const result = await post('/checkout/place-order/vnpay', {
      ...selected,
      previewReference: data.previewReference,
      idempotencyKey: ulid(),
    }).expect(422);
    expect(result.body).toMatchObject({
      code: 'VNPAY_INVALID_AMOUNT',
      message: expect.stringContaining('lớn hơn 0đ'),
    });
    expect(await snapshot()).toEqual(before);
    const cod = { ...selected, paymentMethod: 'COD' };
    const codPreview = await post('/checkout/preview', cod).expect(201);
    await post('/checkout/place-order/cod', {
      ...cod,
      previewReference: (
        codPreview.body as { data: CheckoutPreviewResponseDto }
      ).data.previewReference,
      idempotencyKey: ulid(),
    }).expect(201);
  });

  it.each(['cancel', 'expiry', 'failure race', 'success race'] as const)(
    'keeps order, payment, stock and coupons stable after %s and repeated signed callbacks',
    async (mode) => {
      const { input, data } = await preview('VNPAY');
      const created = await post('/checkout/place-order/vnpay', {
        ...input,
        previewReference: data.previewReference,
        idempotencyKey: ulid(),
      }).expect(201);
      const order = (created.body as { data: VnpayPlaceOrderResponseDto }).data;
      const attempt = await prisma.paymentTransaction.findUniqueOrThrow({
        where: { id: order.paymentTransactionId },
      });
      const stock = () =>
        prisma.branchProductStock.findUniqueOrThrow({
          where: { branchId_variantId: { branchId, variantId } },
        });
      const reservedQuantity = (await stock()).quantity;
      const failure = signed(attempt, {
        vnp_ResponseCode: '24',
        vnp_TransactionStatus: '02',
      });
      const ipn = (query: Record<string, string>) =>
        request(app.getHttpServer())
          .get('/api/v1/payments/vnpay/ipn')
          .query(query)
          .expect(200);
      const returnCallback = (query: Record<string, string>) =>
        request(app.getHttpServer())
          .get('/api/v1/payments/vnpay/return')
          .query(query)
          .expect(302);
      const cancel = () =>
        post(`/customer/orders/${order.orderId}/cancel`, {
          reason: 'Kiểm thử hotfix',
        });

      if (mode === 'expiry') {
        await prisma.couponRedemption.updateMany({
          where: { orderId: order.orderId },
          data: { expiresAt: new Date(Date.now() - 1000) },
        });
        await app.get(CouponsExpiryService).cleanup();
      } else if (mode === 'failure race') {
        const [callback] = await Promise.all([
          ipn(failure),
          cancel().expect(201),
        ]);
        expect(['00', '02']).toContain(
          (callback.body as { RspCode: string }).RspCode,
        );
      } else if (mode === 'success race') {
        const success = signed(attempt);
        const [callback, cancellation] = await Promise.all([
          ipn(success),
          cancel(),
        ]);
        if (cancellation.status === 409) {
          expect(callback.body).toMatchObject({ RspCode: '00' });
          expect((await ipn(success)).body).toMatchObject({ RspCode: '00' });
          expect((await ipn(failure)).body).toMatchObject({ RspCode: '02' });
          expect(
            await prisma.order.findUniqueOrThrow({
              where: { id: order.orderId },
              include: {
                payment: { include: { transactions: true } },
                couponRedemptions: true,
              },
            }),
          ).toMatchObject({
            status: 'PENDING',
            payment: { status: 'PAID', transactions: [{ status: 'PAID' }] },
            couponRedemptions: [{ status: 'CONSUMED' }],
          });
          expect((await stock()).quantity).toBe(reservedQuantity);
          expect(
            await prisma.inventoryMovement.count({
              where: { sourceId: attempt.id, type: 'ORDER_STOCK_RESTORED' },
            }),
          ).toBe(0);
          return;
        }
        expect(cancellation.status).toBe(201);
        expect(callback.body).toMatchObject({ RspCode: '02' });
      } else {
        await cancel().expect(201);
      }
      const state = () =>
        prisma.order.findUniqueOrThrow({
          where: { id: order.orderId },
          include: {
            payment: { include: { transactions: true } },
            couponRedemptions: true,
            statusHistories: true,
          },
        });
      const before = await state();
      expect(before.status).toBe('CANCELLED');
      expect(before.payment?.status).toBe('CANCELLED');
      expect(before.payment?.transactions[0].status).toBe('CANCELLED');
      expect(before.couponRedemptions[0].status).toBe('RELEASED');
      expect((await stock()).quantity).toBe(reservedQuantity + 1);
      const restorations = () =>
        prisma.inventoryMovement.count({
          where: { sourceId: attempt.id, type: 'ORDER_STOCK_RESTORED' },
        });
      expect(await restorations()).toBe(1);
      await returnCallback(failure);
      for (let n = 0; n < 2; n++) {
        expect((await ipn(failure)).body).toMatchObject({ RspCode: '02' });
      }
      expect(await state()).toEqual(before);

      const success = signed(attempt);
      await returnCallback(success);
      expect((await ipn(success)).body).toMatchObject({ RspCode: '02' });
      const after = await state();
      expect(after.status).toBe(before.status);
      expect(after.payment?.status).toBe(before.payment?.status);
      expect(after.statusHistories).toEqual(before.statusHistories);
      expect(after.couponRedemptions).toEqual(before.couponRedemptions);
      expect(after.payment?.transactions[0]).toMatchObject({
        status: 'CANCELLED',
        stockConsumedAt: null,
        secureHashVerified: true,
        responseCode: '00',
      });
      expect(await restorations()).toBe(1);
      expect((await stock()).quantity).toBe(reservedQuantity + 1);
    },
  );
});
