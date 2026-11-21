import { ConfigService } from '@nestjs/config';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { NestFactory } from '@nestjs/core';
import { hash } from 'bcrypt';
import { ulid } from 'ulid';
import { AppModule } from '@/app.module';
import { setupApplication } from '@/core/app.setup';
import { PrismaService } from '@/database/prisma.service';
import { AuthorizationService } from '@/modules/authorization/authorization.service';
import { CheckoutService } from '@/modules/checkout/checkout.service';
import { NotificationWorker } from '@/modules/notifications/notification-worker.service';
import { seedCatalog, ROLE_IDS } from '../../prisma/catalog.seed';
import { createAuthHardeningEnvironment } from './auth-hardening-environment';

export async function createNotificationEnvironment(
  port = 0,
  autoWorker = false,
  configure?: (app: INestApplication) => void,
) {
  const infra = await createAuthHardeningEnvironment('http://localhost:15173');
  Object.assign(process.env, {
    NOTIFICATIONS_POLL_MS: '100',
    REALTIME_ORIGINS: 'http://localhost:15173,http://127.0.0.1:15174',
  });
  const app = await NestFactory.create(AppModule, { logger: false });
  try {
    app
      .get(ConfigService)
      .set('app.corsOrigin', 'http://localhost:15173,http://127.0.0.1:15174');
    setupApplication(app);
    configure?.(app);
    await app.listen(port, '127.0.0.1');
    const prisma = app.get(PrismaService),
      config = app.get(ConfigService);
    const worker = app.get(NotificationWorker);
    if (!autoWorker) await worker.onModuleDestroy();
    await prisma.$transaction((tx) => seedCatalog(tx));
    const password = 'Realtime-Test-Only-2026!';
    const passwordHash = await hash(password, 4);
    const csrf = 'notification-test-csrf-012345678901234567890';
    const jwt = new JwtService();
    async function account(
      name: string,
      type: 'CUSTOMER' | 'BRANCH' | 'SYSTEM',
      role?: string,
    ) {
      const user = await prisma.user.create({
        data: {
          email: `${name}@realtime.example.test`,
          fullName: `Kiểm thử ${name}`,
          type,
          passwordHash,
          ...(role && type !== 'BRANCH'
            ? { userRoles: { create: { roleId: role } } }
            : {}),
        },
      });
      const session = await prisma.authSession.create({
        data: {
          userId: user.id,
          refreshTokenHash: ulid(),
          expiresAt: new Date(Date.now() + 3600000),
        },
      });
      const token = jwt.sign(
        { sub: user.id, sid: session.id },
        {
          secret: config.getOrThrow<string>('auth.jwt.accessSecret'),
          expiresIn: '1h',
        },
      );
      return {
        user,
        session,
        cookie: `accessToken=${token}; csrfToken=${csrf}`,
        token,
      };
    }
    const branches = await Promise.all(
      ['Cần Thơ', 'Hậu Giang'].map((name) =>
        prisma.branch.create({
          data: {
            name: `Chi nhánh ${name}`,
            code: ulid(),
            address: 'Số 1 đường kiểm thử',
            province: 'Thành phố Cần Thơ',
            ward: 'Phường Ninh Kiều',
          },
        }),
      ),
    );
    const customerA = await account(
      'customer-a',
      'CUSTOMER',
      ROLE_IDS.CUSTOMER,
    );
    const customerB = await account(
      'customer-b',
      'CUSTOMER',
      ROLE_IDS.CUSTOMER,
    );
    const inactive = await account('inactive', 'CUSTOMER');
    await prisma.user.update({
      where: { id: inactive.user.id },
      data: { isActive: false },
    });
    const admin = await account('branch-admin', 'BRANCH');
    const cashier = await account('cashier', 'BRANCH');
    const staff = await account('staff', 'BRANCH');
    const readonly = await account('readonly', 'BRANCH');
    const system = await account('super-admin', 'SYSTEM', ROLE_IDS.SUPER_ADMIN);
    async function assign(userId: string, branchId: string, roleId: string) {
      return prisma.userBranch.create({
        data: {
          userId,
          branchId,
          isPrimary: branchId === branches[0].id,
          roles: { create: { roleId } },
        },
      });
    }
    for (const branch of branches)
      await assign(admin.user.id, branch.id, ROLE_IDS.BRANCH_ADMIN);
    await assign(cashier.user.id, branches[0].id, ROLE_IDS.CASHIER);
    const staffAssignment = await assign(
      staff.user.id,
      branches[0].id,
      ROLE_IDS.STAFF,
    );
    const readonlyAssignment = await assign(
      readonly.user.id,
      branches[0].id,
      ROLE_IDS.STAFF,
    );
    const updatePermission = await prisma.permission.findUniqueOrThrow({
      where: { code: 'orders.update_status' },
    });
    await prisma.userBranchPermission.create({
      data: {
        userBranchId: staffAssignment.id,
        permissionId: updatePermission.id,
        effect: 'ALLOW',
      },
    });
    // Explicitly enforce the read-only fixture even if catalog role defaults evolve.
    for (const code of ['orders.update_status', 'orders.cancel']) {
      const permission = await prisma.permission.findUniqueOrThrow({
        where: { code },
      });
      await prisma.userBranchPermission.create({
        data: {
          userBranchId: readonlyAssignment.id,
          permissionId: permission.id,
          effect: 'DENY',
        },
      });
    }
    const product = await prisma.product.create({
      data: {
        name: 'Sách kiểm thử thông báo',
        slug: `notification-${ulid()}`,
        status: 'ACTIVE',
      },
    });
    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: ulid(),
        name: 'Bản tiêu chuẩn',
        combinationKey: 'default',
        originalPrice: 100000,
        weightGram: 350,
        isDefault: true,
      },
    });
    for (const branch of branches)
      await prisma.branchProductStock.create({
        data: {
          branchId: branch.id,
          variantId: variant.id,
          quantity: 1000,
        },
      });
    async function principal(who = customerA) {
      return app
        .get(AuthorizationService)
        .resolvePrincipal(who.session.id, who.user.id);
    }
    async function place(
      method: 'COD' | 'VNPAY' = 'COD',
      branchId = branches[0].id,
      who = customerA,
    ) {
      const actor = await principal(who);
      const cart = await prisma.cart.upsert({
        where: { userId: who.user.id },
        create: { userId: who.user.id, branchId },
        update: { branchId },
      });
      const item = await prisma.cartItem.upsert({
        where: { cartId_variantId: { cartId: cart.id, variantId: variant.id } },
        create: {
          cartId: cart.id,
          variantId: variant.id,
          quantity: 1,
          lastKnownUnitPrice: 100000,
        },
        update: { quantity: 1 },
      });
      const address = await prisma.userAddress.create({
        data: {
          userId: who.user.id,
          receiverName: 'Khách kiểm thử',
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
        paymentMethod: method,
        address: {
          source: 'SAVED_ADDRESS' as const,
          customerAddressId: address.id,
        },
      };
      const checkout = app.get(CheckoutService);
      const preview = await checkout.preview(actor, branchId, input);
      const dto = {
        ...input,
        previewReference: preview.previewReference,
        idempotencyKey: ulid(),
      };
      return method === 'COD'
        ? checkout.placeCod(actor, branchId, dto)
        : checkout.placeVnpay(actor, branchId, dto, '127.0.0.1');
    }
    const url = (await app.getUrl()).replace('127.0.0.1', 'localhost');
    return {
      infra,
      app,
      prisma,
      config,
      worker,
      url,
      csrf,
      password,
      branches,
      customerA,
      customerB,
      inactive,
      admin,
      cashier,
      staff,
      readonly,
      system,
      variant,
      staffAssignment,
      principal,
      place,
      account,
      close: async () => {
        await worker.onModuleDestroy();
        await app.close();
        await infra.close();
      },
    };
  } catch (error) {
    await app.close();
    await infra.close();
    throw error;
  }
}
