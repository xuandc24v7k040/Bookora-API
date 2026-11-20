// Local-only manual verification harness. Never starts against an application DB.
import { createAuthHardeningEnvironment } from './helpers/auth-hardening-environment';
import { ulid } from 'ulid';
import { hash } from 'bcrypt';
import { createRequire } from 'node:module';
import type { INestApplication } from '@nestjs/common';

let runtimeEnvironment:
  | Awaited<ReturnType<typeof createAuthHardeningEnvironment>>
  | undefined;
let runtimeApplication: INestApplication | undefined;

async function start() {
  const env = await createAuthHardeningEnvironment(
    'http://localhost:15173',
    18001,
  );
  runtimeEnvironment = env;
  const load = createRequire(__filename);
  const { AppModule } = load(
    '../src/app.module.ts',
  ) as typeof import('../src/app.module.js');
  const { NestFactory } = await import('@nestjs/core');
  const { setupApplication } = load(
    '../src/core/app.setup.ts',
  ) as typeof import('../src/core/app.setup.js');
  const { PrismaService } = load(
    '../src/database/prisma.service.ts',
  ) as typeof import('../src/database/prisma.service.js');
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn'],
  });
  runtimeApplication = app;
  setupApplication(app);
  await app.init();
  const prisma = app.get(PrismaService);
  const [db] = await prisma.$queryRaw<
    Array<{ name: string }>
  >`SELECT current_database() AS name`;
  if (db?.name !== env.database.databaseName)
    throw new Error('Refusing non-disposable runtime database');
  const role = await prisma.role.findUniqueOrThrow({
    where: { code: 'CUSTOMER' },
  });
  const user = await prisma.user.create({
    data: {
      email: 'browser-customer@example.test',
      fullName: 'Khách kiểm thử Bookora',
      passwordHash: await hash('BookoraTest123', 12),
      userRoles: { create: { roleId: role.id } },
    },
  });
  const branch = await prisma.branch.create({
    data: {
      name: 'Bookora kiểm thử',
      code: 'BROWSER',
      address: 'Địa chỉ giả lập',
      latitude: 10.03,
      longitude: 105.77,
    },
  });
  // Inline image fixture; no remote media or production storage operations.
  const image =
    'data:image/svg+xml,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#356244"/><text x="45" y="240" fill="white" font-size="36">BOOKORA</text></svg>',
    );
  const product = await prisma.product.create({
    data: {
      categories: {
        create: {
          isPrimary: true,
          category: {
            create: { name: 'Sách kiểm thử', slug: 'sach-kiem-thu' },
          },
        },
      },
      name: 'Sách kiểm thử Bookora',
      slug: 'sach-kiem-thu-bookora',
      status: 'ACTIVE',
      media: { create: { url: image, isPrimary: true } },
      variants: {
        create: {
          name: 'Tiêu chuẩn',
          sku: 'BROWSER-BOOK',
          combinationKey: 'default',
          isDefault: true,
          weightGram: 300,
          originalPrice: 100000,
        },
      },
    },
    include: { variants: true },
  });
  const variant = product.variants[0];
  await prisma.branchProductStock.create({
    data: { branchId: branch.id, variantId: variant.id, quantity: 100 },
  });
  const order = await prisma.order.create({
    data: {
      orderCode: 'BROWSER-COMPLETED',
      userId: user.id,
      branchId: branch.id,
      idempotencyKey: ulid(),
      status: 'COMPLETED',
      subtotalAmount: 100000,
      totalAmount: 100000,
      shippingFee: 0,
      receiverName: 'Khách kiểm thử',
      receiverPhone: '0900000000',
      shippingAddress: 'Địa chỉ kiểm thử',
      deliveryAddressSource: 'CURRENT_LOCATION',
      shippingAddressLine: 'Địa chỉ kiểm thử',
      shippingProvinceName: 'Cần Thơ',
      shippingWardName: 'Ninh Kiều',
      branchNameSnapshot: branch.name,
      branchAddressSnapshot: branch.address,
      shippingFeeBreakdownSnapshot: {},
      shippingQuoteReference: ulid(),
      items: {
        create: {
          productId: product.id,
          variantId: variant.id,
          productName: product.name,
          productSlug: product.slug,
          variantLabel: 'Tiêu chuẩn',
          variantOptions: [],
          quantity: 1,
          unitPrice: 100000,
          originalPrice: 100000,
          lineTotal: 100000,
        },
      },
    },
    include: { items: true },
  });
  const review = await prisma.review.create({
    data: {
      userId: user.id,
      productId: product.id,
      orderId: order.id,
      orderItemId: order.items[0].id,
      branchId: branch.id,
      rating: 5,
      content: 'Đánh giá dùng cho kiểm thử ảnh và bố cục.',
      media: {
        create: {
          objectKey: `reviews/browser/${ulid()}.svg`,
          url: image,
          sortOrder: 0,
        },
      },
    },
  });
  const cart = await prisma.cart.create({
    data: {
      userId: user.id,
      branchId: branch.id,
      items: {
        create: {
          variantId: variant.id,
          quantity: 1,
          lastKnownUnitPrice: 100000,
        },
      },
    },
    include: { items: true },
  });
  for (const type of ['ORDER', 'SHIPPING'] as const)
    await prisma.coupon.create({
      data: {
        code: `TEST-${type}`,
        name: 'Voucher kiểm thử',
        type,
        discountType: 'FIXED_AMOUNT',
        discountValue: 10000,
        startAt: new Date(Date.now() - 60_000),
        endAt: new Date(Date.now() + 3_600_000),
      },
    });
  await app.listen(18000, '127.0.0.1');
  console.log(
    JSON.stringify({
      status: 'READY',
      api: 'http://localhost:18000/api/v1',
      mailbox: env.mailboxUrl,
      database: env.database.databaseName,
      productSlug: product.slug,
      reviewId: review.id,
      cartItemId: cart.items[0].id,
    }),
  );
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await app.close();
    await env.close();
    process.exit(0);
  };
  process.on('SIGINT', () => {
    void close();
  });
  process.on('SIGTERM', () => {
    void close();
  });
}

void start().catch(async (error: unknown) => {
  console.error(
    'Isolated browser runtime failed to start',
    error instanceof Error
      ? error.message.replace(
          /postgres(?:ql)?:\/\/\S+/g,
          '[database URL redacted]',
        )
      : 'Unknown error',
  );
  await runtimeApplication?.close().catch(() => undefined);
  await runtimeEnvironment?.close().catch(() => {
    console.error('Disposable runtime cleanup failed');
  });
  process.exit(1);
});
