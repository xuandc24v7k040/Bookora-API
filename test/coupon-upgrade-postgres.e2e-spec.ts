import { readdirSync } from 'node:fs';
import { ConfigService } from '@nestjs/config';
import { RevenueReportsRepository } from '@/modules/revenue-reports/revenue-reports.repository';
import { RevenuePaymentMethod } from '@/modules/revenue-reports/dto';
import { DashboardRepository } from '@/modules/dashboard/dashboard.repository';
import { resolveAnalyticsDateRange } from '@/modules/analytics/analytics-date-range';
import { PrismaService } from '@/database/prisma.service';
import { CouponsRepository } from '@/modules/coupons/coupons.repository';
import { CouponsService } from '@/modules/coupons/coupons.service';
import { CouponsExpiryService } from '@/modules/coupons/coupons-expiry.service';
import {
  assertCouponReservation,
  consumeCouponRedemptions,
  releaseCouponRedemptions,
} from '@/modules/coupons/coupon-redemption';
import {
  seedDemoCoupons,
  COUPON_DEMO_FIXTURES,
} from '../prisma/seed/coupons.seed';
import {
  createDisposablePostgresDatabase,
  readMigrationSql,
  type DisposablePostgresDatabase,
} from './helpers/postgres-test-database';

describe('Coupon Upgrade real PostgreSQL transactions', () => {
  let database: DisposablePostgresDatabase;
  let prisma: PrismaService;
  let service: CouponsService;
  let repository: CouponsRepository;
  const context = {
    userId: 'coupon-user',
    subtotal: 500_000,
    shippingFee: 30_000,
  };
  beforeAll(async () => {
    database = await createDisposablePostgresDatabase('coupons');
    for (const migration of readdirSync('prisma/migrations')
      .filter(
        (name) => /^\d/.test(name) && name < '20261117090000_coupon_upgrade',
      )
      .sort()) {
      await database.runSql(readMigrationSql(migration));
    }
    await database.runSql(`
      INSERT INTO users(id,email,created_at,updated_at) VALUES ('coupon-user','coupon@example.test',now(),now());
      INSERT INTO branches(id,name,code,address,created_at,updated_at) VALUES ('coupon-branch','Coupon','COUPON','Address',now(),now());
      INSERT INTO orders(id,order_code,user_id,branch_id,status,subtotal_amount,total_amount,shipping_fee,
        receiver_name,receiver_phone,shipping_address,idempotency_key,delivery_address_source,
        shipping_address_line,shipping_province_name,shipping_ward_name,branch_name_snapshot,branch_address_snapshot,
        shipping_fee_breakdown_snapshot,shipping_quote_reference,created_at,updated_at)
      SELECT 'coupon-order-'||n,'coupon-order-'||n,'coupon-user','coupon-branch','PENDING_PAYMENT',500000,530000,30000,
        'Customer','0900000000','Address','coupon-order-'||n,'CURRENT_LOCATION','Address','Province','Ward','Branch','Address','{}','quote',now(),now()
      FROM generate_series(1,80) n;
    `);
    const legacy = await database.query(
      'SELECT id, subtotal_amount, shipping_fee, total_amount FROM orders ORDER BY id',
    );
    await database.runSql(readMigrationSql('20261117090000_coupon_upgrade'));
    expect(
      await database.query(
        'SELECT id, subtotal_amount, shipping_fee, total_amount FROM orders ORDER BY id',
      ),
    ).toEqual(legacy);
    for (const migration of readdirSync('prisma/migrations')
      .filter(
        (name) => /^\d/.test(name) && name > '20261117090000_coupon_upgrade',
      )
      .sort()) {
      await database.runSql(readMigrationSql(migration));
    }
    prisma = new PrismaService({
      getOrThrow: () => database.databaseUrl,
      get: () => 'test',
    } as unknown as ConfigService);
    await prisma.$connect();
    repository = new CouponsRepository(prisma);
    service = new CouponsService(repository);
  }, 120000);
  afterAll(async () => {
    await prisma?.$disconnect();
    await database?.close();
  });

  it('seeds exactly 15 (10 ORDER, 5 SHIPPING), quota 100, two PRIVATE; rerun preserves admin changes and usage', async () => {
    await prisma.$transaction((tx) => seedDemoCoupons(tx));
    const rows = await prisma.coupon.findMany();
    expect(rows).toHaveLength(15);
    expect(rows.filter((row) => row.type === 'ORDER')).toHaveLength(10);
    expect(rows.filter((row) => row.type === 'SHIPPING')).toHaveLength(5);
    expect(
      rows.every(
        (row) =>
          row.usageLimit === 100 &&
          row.usageLimitPerUser === 1 &&
          row.startAt < new Date() &&
          row.endAt > new Date(),
      ),
    ).toBe(true);
    await prisma.coupon.update({
      where: { code: 'BOOKORA70K' },
      data: { isActive: false },
    });
    await prisma.$transaction((tx) => seedDemoCoupons(tx));
    expect(await prisma.coupon.count()).toBe(COUPON_DEMO_FIXTURES.length);
    expect(
      (await prisma.coupon.findUniqueOrThrow({ where: { code: 'BOOKORA70K' } }))
        .isActive,
    ).toBe(false);
  });
  it('lists PUBLIC only; preview normalizes private input without holding quota; combines ORDER + SHIPPING', async () => {
    expect(
      (await service.publicList(context)).every(
        (row) => !['READMORE25', 'WELCOMEBOOK'].includes(row.code),
      ),
    ).toBe(true);
    const selected = await service.resolve(context, {
      orderCouponCode: ' bookora10 ',
      shippingCouponCode: 'SHIP20',
    });
    expect(selected.map((row) => row.discountAmount)).toEqual([40_000, 20_000]);
    expect(
      (await service.resolve(context, { couponCode: ' readmore25 ' }))[0].coupon
        .type,
    ).toBe('ORDER');
    expect(await prisma.couponRedemption.count()).toBe(0);
  });
  it('rejects invalid, wrong group, minimum and shipping without a quote; clamps SHIP50', async () => {
    for (const code of ['', 'BAD', 'SHIP20'])
      await expect(
        service.resolve(context, { orderCouponCode: code }),
      ).rejects.toThrow();
    await expect(
      service.resolve(
        { ...context, subtotal: 299999 },
        { orderCouponCode: 'BOOKORA10' },
      ),
    ).rejects.toMatchObject({ response: { code: 'COUPON_MIN_ORDER' } });
    await expect(
      service.resolve(
        { ...context, shippingFee: null },
        { shippingCouponCode: 'SHIP20' },
      ),
    ).rejects.toMatchObject({ response: { code: 'COUPON_SHIPPING_REQUIRED' } });
    expect(
      (
        await service.resolve(
          { ...context, subtotal: 700000 },
          { shippingCouponCode: 'SHIP50' },
        )
      )[0].discountAmount,
    ).toBe(30000);
  });
  it('does not oversubscribe the last global use under 55 parallel DB requests', async () => {
    await prisma.coupon.update({
      where: { code: 'BOOKORA30' },
      data: { usageLimit: 1, usageLimitPerUser: null },
    });
    const selected = await service.resolve(context, {
      orderCouponCode: 'BOOKORA30',
    });
    const results = await Promise.allSettled(
      Array.from({ length: 55 }, (_, n) =>
        repository.transaction((tx) =>
          service.redeem(tx, `coupon-order-${n + 1}`, context, selected, null),
        ),
      ),
    );
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      await prisma.couponRedemption.count({
        where: { couponId: selected[0].coupon.id },
      }),
    ).toBe(1);
  }, 120000);
  it('enforces per-user=1 with two simultaneous tabs, and rollback leaves no orphan', async () => {
    const selected = await service.resolve(context, {
      orderCouponCode: 'BOOKORA20K',
    });
    await expect(
      repository.transaction(async (tx) => {
        await service.redeem(tx, 'coupon-order-60', context, selected, null);
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(
      await prisma.couponRedemption.count({
        where: { couponId: selected[0].coupon.id },
      }),
    ).toBe(0);
    const results = await Promise.allSettled(
      [61, 62].map((n) =>
        repository.transaction((tx) =>
          service.redeem(tx, `coupon-order-${n}`, context, selected, null),
        ),
      ),
    );
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
  });
  it('preserves snapshots through rule edits, same-order retry does not reserve again, consume/release is idempotent', async () => {
    const selected = await service.resolve(context, {
      orderCouponCode: 'BOOKORA10',
    });
    const expiry = new Date(Date.now() + 3600000);
    await repository.transaction((tx) =>
      service.redeem(tx, 'coupon-order-65', context, selected, expiry),
    );
    await prisma.coupon.update({
      where: { code: 'BOOKORA10' },
      data: { discountValue: 1, isActive: false },
    });
    await repository.transaction((tx) =>
      assertCouponReservation(tx, 'coupon-order-65', new Date()),
    );
    await repository.transaction((tx) =>
      consumeCouponRedemptions(tx, 'coupon-order-65', new Date()),
    );
    await repository.transaction((tx) =>
      consumeCouponRedemptions(tx, 'coupon-order-65', new Date()),
    );
    const row = await prisma.couponRedemption.findFirstOrThrow({
      where: { orderId: 'coupon-order-65' },
    });
    expect(row.status).toBe('CONSUMED');
    expect(Number(row.appliedDiscountAmount)).toBe(40000);
    expect(row.couponCodeSnapshot).toBe('BOOKORA10');
    await prisma.$transaction((tx) => seedDemoCoupons(tx));
    expect(
      await prisma.couponRedemption.findUniqueOrThrow({
        where: { id: row.id },
      }),
    ).toEqual(row);
    expect(
      (await prisma.coupon.findUniqueOrThrow({ where: { code: 'BOOKORA10' } }))
        .isActive,
    ).toBe(false);
    await repository.transaction((tx) =>
      releaseCouponRedemptions(tx, 'coupon-order-65', new Date()),
    );
    await repository.transaction((tx) =>
      releaseCouponRedemptions(tx, 'coupon-order-65', new Date()),
    );
    await expect(
      repository.transaction((tx) =>
        consumeCouponRedemptions(tx, 'coupon-order-65', new Date()),
      ),
    ).rejects.toThrow();
    expect(
      await prisma.couponRedemption.count({
        where: { orderId: 'coupon-order-65' },
      }),
    ).toBe(1);
  });
  it('rejects a rule edit after preview and cleans up abandoned reserved orders eventually', async () => {
    const selected = await service.resolve(context, {
      shippingCouponCode: 'SHIP20',
    });
    await prisma.coupon.update({
      where: { code: 'SHIP20' },
      data: { description: 'changed' },
    });
    await expect(
      repository.transaction((tx) =>
        service.redeem(tx, 'coupon-order-66', context, selected, null),
      ),
    ).rejects.toMatchObject({ response: { code: 'CHECKOUT_PREVIEW_CHANGED' } });
    const fresh = await service.resolve(context, {
      shippingCouponCode: 'SHIP20',
    });
    await repository.transaction((tx) =>
      service.redeem(
        tx,
        'coupon-order-67',
        context,
        fresh,
        new Date(Date.now() - 1000),
      ),
    );
    await new CouponsExpiryService(prisma).cleanup();
    expect(
      (
        await prisma.order.findUniqueOrThrow({
          where: { id: 'coupon-order-67' },
        })
      ).status,
    ).toBe('CANCELLED');
    expect(
      (
        await prisma.couponRedemption.findFirstOrThrow({
          where: { orderId: 'coupon-order-67' },
        })
      ).status,
    ).toBe('RELEASED');
  });
  it('reports net merchandise and shipping from snapshots, including allocated top-product revenue', async () => {
    const now = new Date();
    await prisma.order.update({
      where: { id: 'coupon-order-79' },
      data: {
        status: 'COMPLETED',
        orderCouponDiscountAmount: 40000,
        shippingCouponDiscountAmount: 20000,
        totalAmount: 470000,
        items: {
          create: {
            productName: 'Historical coupon book',
            productSlug: 'historical-coupon-book',
            variantLabel: 'Bản cũ',
            variantOptions: [],
            quantity: 2,
            unitPrice: 250000,
            originalPrice: 300000,
            discountAmount: 100000,
            lineTotal: 500000,
            couponDiscountAmount: 40000,
          },
        },
        payment: {
          create: {
            method: 'COD',
            status: 'PAID',
            amount: 470000,
            paidAt: now,
          },
        },
        statusHistories: {
          create: {
            toStatus: 'COMPLETED',
            actorType: 'SYSTEM',
            branchId: 'coupon-branch',
            createdAt: now,
          },
        },
      },
    });
    const range = resolveAnalyticsDateRange({ preset: '7D', now });
    const scope = { mode: 'GLOBAL' as const, branchIds: null, branchId: null };
    expect(
      await new RevenueReportsRepository(prisma).summary(
        range,
        scope,
        RevenuePaymentMethod.ALL,
      ),
    ).toMatchObject({
      completedRevenue: 470000,
      merchandiseRevenue: 460000,
      shippingRevenue: 10000,
      soldQuantity: 2,
    });
    expect(
      await new DashboardRepository(prisma).topProducts(range, scope),
    ).toEqual([expect.objectContaining({ revenue: 460000, soldQuantity: 2 })]);
  });

  it('keeps legacy order amounts and defaults intact and protects case-insensitive uniqueness', async () => {
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: 'coupon-order-80' },
    });
    expect(Number(order.totalAmount)).toBe(530000);
    expect(Number(order.orderCouponDiscountAmount)).toBe(0);
    expect(Number(order.shippingCouponDiscountAmount)).toBe(0);
    await expect(
      database.query(
        `INSERT INTO coupons(id,code,name,discount_type,discount_value,start_at,end_at,updated_at) VALUES ('collision','bookora10','Duplicate','FIXED_AMOUNT',1,now(),now()+interval '1 day',now())`,
      ),
    ).rejects.toThrow();
  });
});
