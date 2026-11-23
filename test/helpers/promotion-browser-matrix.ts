import { writeFileSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import { ulid } from 'ulid';
import { PrismaService } from '@/database/prisma.service';
import { CouponsService } from '@/modules/coupons/coupons.service';
import { FlashSalesService } from '@/modules/flash-sales/flash-sales.service';

/** Synthetic authority fixtures, only called behind the local disposable-DB guard. */
export async function runPromotionBrowserMatrix(app: INestApplication) {
  const prisma = app.get(PrismaService),
    coupons = app.get(CouponsService),
    sales = app.get(FlashSalesService);
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: 'super-admin@realtime.example.test' },
  });
  const customer = await prisma.user.findUniqueOrThrow({
    where: { email: 'customer-a@realtime.example.test' },
  });
  const order = await prisma.order.findFirstOrThrow({
    where: { userId: customer.id },
    orderBy: { createdAt: 'desc' },
    include: { items: true },
  });
  const variant = await prisma.productVariant.findFirstOrThrow({
    where: {
      isDefault: true,
      product: { slug: { startsWith: 'notification-' } },
    },
  });
  const epoch = Date.now(),
    date = (delay: number) => new Date(epoch + delay).toISOString();
  const directory =
    process.env.LATENCY_EVIDENCE_DIR ??
    'C:/Users/Admin/AppData/Local/Temp/bookora-promotion-sync';
  const cases: Array<{
    label: string;
    id: string;
    type: 'COUPON_ACTIVE' | 'FLASH_SALE_ACTIVE';
    startAt: string;
  }> = [];
  const createCoupon = async (
    label: string,
    overrides: Partial<Parameters<CouponsService['save']>[0]> = {},
  ) => {
    const input = {
      code: `M${ulid()}`,
      name: `Matrix ${label}`,
      type: 'ORDER' as const,
      visibility: 'PUBLIC' as const,
      discountType: 'PERCENTAGE' as const,
      discountValue: 5,
      startAt: date(30000),
      endAt: date(90000),
      isActive: true,
      ...overrides,
    };
    const row = await coupons.save(input);
    cases.push({
      label,
      id: row.id,
      type: 'COUPON_ACTIVE',
      startAt: row.startAt,
    });
    return { row, input };
  };
  const privateRow = await createCoupon('private', { visibility: 'PRIVATE' });
  await createCoupon('disabled', { isActive: false });
  await createCoupon('expired', { startAt: date(-60000), endAt: date(-1000) });
  const exhausted = await createCoupon('exhausted', { usageLimit: 1 });
  // Pre-seeded consumed quota tests execution-time authority; this is not a Checkout test.
  await prisma.couponRedemption.create({
    data: {
      couponId: exhausted.row.id,
      orderId: order.id,
      userId: customer.id,
      couponType: 'ORDER',
      couponCodeSnapshot: exhausted.row.code,
      appliedDiscountAmount: 1000,
      status: 'CONSUMED',
      consumedAt: new Date(),
    },
  });
  await createCoupon('minimum-silver', {
    type: 'SHIPPING',
    minimumMembershipTier: 'SILVER',
  });
  const earlier = await createCoupon('earlier', { startAt: date(60000) });
  await coupons.save(
    { ...earlier.input, startAt: date(20000) },
    earlier.row.id,
  );
  cases.find((row) => row.id === earlier.row.id)!.startAt = date(20000);
  const later = await createCoupon('later', { startAt: date(15000) });
  await coupons.save({ ...later.input, startAt: date(45000) }, later.row.id);
  cases.find((row) => row.id === later.row.id)!.startAt = date(45000);
  const cancelled = await createCoupon('disable-near-due');
  const createSale = async (label: string, publish = true) => {
    const copy = await prisma.productVariant.create({
      data: {
        productId: variant.productId,
        sku: ulid(),
        name: 'Matrix variant',
        combinationKey: ulid(),
        originalPrice: 100000,
        weightGram: 350,
      },
    });
    const branch = await prisma.branch.findFirstOrThrow({
      where: { isActive: true },
    });
    await prisma.branchProductStock.create({
      data: { branchId: branch.id, variantId: copy.id, quantity: 100 },
    });
    const row = await sales.save(
      {
        name: `Matrix ${label}`,
        startAt: date(30000),
        endAt: date(90000),
        items: [
          {
            variantId: copy.id,
            flashPrice: 80000,
            totalQuota: 1,
            maxQuantityPerUser: 1,
          },
        ],
      },
      admin.id,
    );
    if (publish) await sales.control(row.id, { action: 'publish' }, admin.id);
    cases.push({
      label,
      id: row.id,
      type: 'FLASH_SALE_ACTIVE',
      startAt: row.startAt,
    });
    return row;
  };
  await createSale('draft', false);
  const cancelledSale = await createSale('cancelled');
  await sales.control(
    cancelledSale.id,
    { action: 'cancel', reason: 'Disposable verification' },
    admin.id,
  );
  const invalid = await createSale('inactive-variant');
  await prisma.productVariant.update({
    where: { id: invalid.items[0].variantId },
    data: { isActive: false },
  });
  const full = await createSale('quota-full');
  await prisma.flashSaleAllocation.create({
    data: {
      flashSaleItemId: full.items[0].id,
      orderId: order.id,
      orderItemId: order.items[0].id,
      userId: customer.id,
      quantity: 1,
      status: 'CONSUMED',
      consumedAt: new Date(),
    },
  });
  await createSale('valid-simultaneous');
  const save = () =>
    writeFileSync(
      `${directory}/manual-edge-matrix.json`,
      JSON.stringify({ epoch, cases, privateId: privateRow.row.id }, null, 2),
    );
  save();
  console.log(JSON.stringify({ matrixScheduled: true, epoch, cases }));
  await new Promise((resolve) =>
    setTimeout(resolve, Math.max(0, epoch + 29000 - Date.now())),
  );
  await coupons.setActive(cancelled.row.id, false);
  console.log('DISABLED_ONE_SECOND_BEFORE_DUE');
  await new Promise((resolve) =>
    setTimeout(resolve, Math.max(0, epoch + 47000 - Date.now())),
  );
  const results = await Promise.all(
    cases.map(async (row) => ({
      ...row,
      recipients: await prisma.notification.findMany({
        where: { referenceId: row.id },
        select: { userId: true, type: true, createdAt: true },
      }),
    })),
  );
  writeFileSync(
    `${directory}/manual-edge-matrix-results.json`,
    JSON.stringify({ epoch, results }, null, 2),
  );
  console.log(JSON.stringify({ matrixResults: results }));
}
