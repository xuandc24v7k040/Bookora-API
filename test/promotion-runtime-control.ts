import { config as dotenv } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { ulid } from 'ulid';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/database/prisma.service';
import { AuthorizationService } from '@/modules/authorization/authorization.service';
import { CheckoutService } from '@/modules/checkout/checkout.service';
import { AdminOrdersService } from '@/modules/admin-orders/admin-orders.service';
import { CustomerOrdersService } from '@/modules/customer-orders/customer-orders.service';
import { runPromotionBrowserMatrix } from './helpers/promotion-browser-matrix';

/** Explicitly reuses only the named disposable fixture. No server or public endpoint. */
async function main() {
  dotenv({ quiet: true });
  const name = process.env.PROMOTION_TEST_DATABASE ?? '';
  if (!/^bookora_it_auth_hardening_\d+_[a-f0-9]{6}$/.test(name))
    throw new Error('Disposable fixture database required');
  const url = new URL(process.env.DATABASE_URL!);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    throw new Error('Local fixture required');
  url.pathname = `/${name}`;
  Object.assign(process.env, {
    DATABASE_URL: url.toString(),
    NODE_ENV: 'test',
    TURNSTILE_ENABLED: 'false',
  });
  const app = await NestFactory.create(AppModule, { logger: false });
  try {
    if (process.argv[2] === 'matrix') {
      await runPromotionBrowserMatrix(app);
      return;
    }
    const prisma = app.get(PrismaService),
      authorization = app.get(AuthorizationService);
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: 'customer-b@realtime.example.test' },
    });
    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: 'branch-admin@realtime.example.test' },
    });
    const session = await prisma.authSession.findFirstOrThrow({
      where: { userId: user.id, revokedAt: null },
    });
    const adminSession = await prisma.authSession.findFirstOrThrow({
      where: { userId: admin.id, revokedAt: null },
    });
    const customer = await authorization.resolvePrincipal(session.id, user.id);
    const actor = await authorization.resolvePrincipal(
      adminSession.id,
      admin.id,
    );
    const branchId = actor.allowedBranchIds[0];
    actor.permissions = actor.branchAssignments.find(
      (branch) => branch.branchId === branchId,
    )!.permissions;
    const context = {
      scope: 'SELECTED' as const,
      selectedBranchId: branchId,
      allowedBranchIds: actor.allowedBranchIds,
    };
    const variant = await prisma.productVariant.findFirstOrThrow({
      where: {
        isDefault: true,
        product: { slug: { startsWith: 'notification-' } },
      },
    });
    const cart = await prisma.cart.upsert({
      where: { userId: user.id },
      create: { userId: user.id, branchId },
      update: { branchId },
    });
    async function cartItem() {
      return prisma.cartItem.upsert({
        where: { cartId_variantId: { cartId: cart.id, variantId: variant.id } },
        create: {
          cartId: cart.id,
          variantId: variant.id,
          quantity: 1,
          lastKnownUnitPrice: variant.originalPrice,
        },
        update: { quantity: 1, lastKnownUnitPrice: variant.originalPrice },
      });
    }
    if (process.argv[2] === 'prepare-b') {
      const item = await cartItem();
      const address = await prisma.userAddress.create({
        data: {
          userId: user.id,
          receiverName: 'Khách fixture B',
          receiverPhone: '0900000000',
          detail: 'Số 1 kiểm thử',
          province: 'Thành phố Cần Thơ',
          provinceCode: 92,
          ward: 'Phường Ninh Kiều',
          wardCode: 31135,
        },
      });
      const input = {
        selectedCartItemIds: [item.id],
        paymentMethod: 'COD' as const,
        address: {
          source: 'SAVED_ADDRESS' as const,
          customerAddressId: address.id,
        },
      };
      const checkout = app.get(CheckoutService),
        preview = await checkout.preview(customer, branchId, input);
      const order = await checkout.placeCod(customer, branchId, {
        ...input,
        previewReference: preview.previewReference,
        idempotencyKey: ulid(),
      });
      for (const targetStatus of ['CONFIRMED', 'PACKING', 'SHIPPING'] as const)
        await app
          .get(AdminOrdersService)
          .transition(actor, context, order.orderId, { targetStatus });
      await app
        .get(CustomerOrdersService)
        .confirmReceived(customer, order.orderId);
      await cartItem();
      console.log(
        JSON.stringify({
          orderId: order.orderId,
          orderCode: order.orderCode,
          branchId,
          readyForCompletion: true,
        }),
      );
    }
  } finally {
    await app.close();
  }
}
void main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : 'Fixture control failed',
  );
  process.exitCode = 1;
});
