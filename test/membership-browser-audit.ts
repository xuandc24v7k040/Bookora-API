import { config } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from '@/generated/prisma/client';
import { ulid } from 'ulid';
import { backfillMembership } from '@/modules/membership/membership-backfill';
import { creditMembershipOrder } from '@/modules/membership/membership-credit';
import { MembershipQueryService } from '@/modules/membership/membership-query.service';

// Explicit disposable browser fixture only; never accepts the application database.
config({ quiet: true });
const fixtureDatabase = 'bookora_it_auth_hardening_1795320689805_eeb055';
const url = new URL(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!);
if (!['localhost', '127.0.0.1'].includes(url.hostname))
  throw new Error('Local fixture required');
url.pathname = '/' + fixtureDatabase;
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url.toString() }),
});

async function fixtureOrder(
  email: string,
  amount: number,
  source: 'ORDER' | 'BACKFILL',
) {
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  if (user.type !== 'CUSTOMER' || !email.endsWith('@realtime.example.test'))
    throw new Error('Fixture customer required');
  const existing = await db.order.findFirst({
    where: {
      userId: user.id,
      orderCode: { startsWith: 'BROWSER-' },
      subtotalAmount: amount,
    },
  });
  if (existing)
    return { email, orderId: existing.id, credited: 'ALREADY_PREPARED' };
  const original = await db.order.findFirstOrThrow({
    where: { status: 'COMPLETED' },
    include: { items: true },
  });
  const { items, ...order } = original;
  const item = items[0];
  return db.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        ...order,
        id: ulid(),
        orderCode: 'BROWSER-' + ulid(),
        idempotencyKey: ulid(),
        userId: user.id,
        sourceCustomerAddressId: null,
        subtotalAmount: amount,
        totalAmount: amount + 30000,
        shippingFee: 30000,
        shippingFeeBreakdownSnapshot:
          order.shippingFeeBreakdownSnapshot as Prisma.InputJsonValue,
        items: {
          create: {
            ...item,
            id: ulid(),
            orderId: undefined,
            sourceCartItemId: null,
            unitPrice: amount,
            originalPrice: amount,
            catalogEffectivePrice: amount,
            lineTotal: amount,
            variantOptions: item.variantOptions as Prisma.InputJsonValue,
          },
        },
        payment: {
          create: {
            method: 'COD',
            status: 'PAID',
            amount: amount + 30000,
            paidAt: new Date(),
          },
        },
        statusHistories: {
          create: {
            fromStatus: 'SHIPPING',
            toStatus: 'COMPLETED',
            actorType: 'ADMIN',
            branchId: order.branchId,
          },
        },
      },
    });
    return {
      email,
      orderId: created.id,
      credited: await creditMembershipOrder(tx, created.id, source),
    };
  });
}

async function main() {
  const current = await db.$queryRaw<
    Array<{ name: string }>
  >`SELECT current_database() AS name`;
  if (current[0]?.name !== fixtureDatabase)
    throw new Error('Unexpected database');
  const command = process.argv[2];
  if (command === 'profile') {
    const profiled = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url.toString() }),
      log: [{ emit: 'event', level: 'query' }],
    });
    let selects = 0;
    profiled.$on('query', (event) => {
      if (/^SELECT/i.test(event.query)) selects++;
    });
    const service = new MembershipQueryService(
      Object.assign(profiled, {
        onModuleInit: async () => {},
        onModuleDestroy: async () => {},
      }),
    );
    const customer = await db.user.findUniqueOrThrow({
      where: { email: 'customer-a@realtime.example.test' },
    });
    for (const limit of [3, 10, 20]) {
      for (const kind of ['transactions', 'coupons', 'members'] as const) {
        selects = 0;
        const started = Date.now();
        const result =
          kind === 'members'
            ? await service.members({ page: 1, limit })
            : await service[kind](customer.id, { page: 1, limit });
        console.log(
          JSON.stringify({
            kind,
            limit,
            items: result.items.length,
            selects,
            ms: Date.now() - started,
          }),
        );
      }
    }
    await profiled.$disconnect();
  }
  if (command === 'prepare') {
    console.log(
      await fixtureOrder(
        'customer-b@realtime.example.test',
        2500000,
        'BACKFILL',
      ),
    );
    console.log(
      await fixtureOrder(
        'member-00@realtime.example.test',
        1500000,
        'BACKFILL',
      ),
    );
  }
  if (command === 'cart' || command === 'prepare') {
    const variant = await db.productVariant.findFirstOrThrow();
    const customer = await db.user.findUniqueOrThrow({
      where: { email: 'customer-b@realtime.example.test' },
    });
    const branch = await db.branch.findFirstOrThrow({
      where: { name: 'Chi nhánh Cần Thơ' },
    });
    const cart = await db.cart.upsert({
      where: { userId: customer.id },
      create: { userId: customer.id, branchId: branch.id },
      update: { branchId: branch.id },
    });
    await db.cartItem.upsert({
      where: { cartId_variantId: { cartId: cart.id, variantId: variant.id } },
      create: {
        cartId: cart.id,
        variantId: variant.id,
        quantity: 1,
        lastKnownUnitPrice: 3500000,
      },
      update: { quantity: 1 },
    });
  }
  if (command === 'offline-credit')
    console.log(
      await fixtureOrder('member-01@realtime.example.test', 2500000, 'ORDER'),
    );
  if (command === 'backfill')
    console.log(await backfillMembership(db, { apply: true, batchSize: 4 }));
  console.log(
    JSON.stringify({
      database: current[0].name,
      profiles: await db.customerMembership.findMany({
        where: { lifetimeSpend: { gt: 0 } },
      }),
      credits: await db.membershipTransaction.count(),
      sum: await db.membershipTransaction.aggregate({ _sum: { amount: true } }),
      finalOrder: await db.order.findUnique({
        where: { id: '01M80Q7S2VHBAX204E71R29HE1' },
        select: {
          status: true,
          payment: { select: { status: true, amount: true } },
          membershipTransaction: { select: { amount: true, source: true } },
        },
      }),
      tierNotifications: await db.notification.findMany({
        where: { type: 'MEMBERSHIP_UPGRADED' },
        select: { userId: true, title: true, createdAt: true },
      }),
      campaignRecipients: await db.notification.findMany({
        where: { type: 'COUPON_ACTIVE' },
        select: { userId: true, title: true },
      }),
      jobs: await db.notificationDispatch.groupBy({
        by: ['state'],
        _count: true,
      }),
    }),
  );
}
void main().finally(() => db.$disconnect());
