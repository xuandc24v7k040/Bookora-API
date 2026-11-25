import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hash } from 'bcrypt';
import { ulid } from 'ulid';
import { PrismaClient } from '@/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  if (
    url.pathname !== '/bookora_db' ||
    !['localhost', '127.0.0.1'].includes(url.hostname)
  )
    throw new Error('Fixture target is not confirmed local app DB');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url.toString() }),
  });
  try {
    const run = `support-hf1-${ulid().toLowerCase()}`;
    const password = `HF1-${randomBytes(15).toString('hex')}!`;
    const passwordHash = await hash(password, 10);
    const roles = await prisma.role.findMany({
      where: { code: { in: ['BRANCH_ADMIN', 'STAFF', 'CASHIER', 'CUSTOMER'] } },
    });
    const roleId = (code: string) => {
      const role = roles.find((r) => r.code === code);
      if (!role) throw new Error('Missing fixture role');
      return role.id;
    };
    const branches = await Promise.all(
      ['Ninh Kiều', 'Cần Thơ'].map((name, index) =>
        prisma.branch.create({
          data: {
            code: `${run}-${index}`,
            name: `Bookora ${name} · Kiểm thử HF1`,
            address: 'Địa chỉ kiểm thử tích hợp',
            province: 'Thành phố Cần Thơ',
            ward: 'Phường Ninh Kiều',
          },
        }),
      ),
    );
    const users: Record<string, { id: string; email: string; name: string }> =
      {};
    for (const [key, name, type, role] of [
      ['customer', 'Khách hàng kiểm thử HF1', 'CUSTOMER', 'CUSTOMER'],
      ['foreign', 'Khách khác kiểm thử HF1', 'CUSTOMER', 'CUSTOMER'],
      ['admin', 'Quản trị hỗ trợ P2', 'BRANCH', 'BRANCH_ADMIN'],
      ['staff', 'Nhân viên hỗ trợ P2', 'BRANCH', 'STAFF'],
      ['readonly', 'Nhân viên chỉ xem P2', 'BRANCH', 'STAFF'],
      ['manager', 'Quản lý hỗ trợ P2', 'BRANCH', 'STAFF'],
      ['ordersOnly', 'Thu ngân đơn hàng P2', 'BRANCH', 'CASHIER'],
      ['delegated', 'Nhân viên được cấp quyền P2', 'BRANCH', 'STAFF'],
    ] as const) {
      const user = await prisma.user.create({
        data: {
          email: `${key}.${run}@example.test`.toLowerCase(),
          fullName: name,
          type,
          passwordHash,
          emailVerifiedAt: new Date(),
          ...(type === 'CUSTOMER'
            ? { userRoles: { create: { roleId: roleId(role) } } }
            : {}),
        },
      });
      users[key] = { id: user.id, email: user.email, name };
      if (type !== 'BRANCH') continue;
      for (const branch of key === 'admin' ? branches : [branches[0]]) {
        const assignment = await prisma.userBranch.create({
          data: {
            userId: user.id,
            branchId: branch.id,
            isPrimary: branch.id === branches[0].id,
            roles: { create: { roleId: roleId(role) } },
          },
        });
        const grants =
          key === 'staff'
            ? ['support.read', 'support.claim', 'support.reply']
            : key === 'readonly'
              ? ['support.read']
              : key === 'manager'
                ? ['support.read', 'support.manage']
                : [];
        for (const code of [
          ...grants,
          ...(['staff', 'readonly', 'manager'].includes(key)
            ? ['orders.read']
            : []),
        ]) {
          const permission = await prisma.permission.findUniqueOrThrow({
            where: { code },
          });
          await prisma.userBranchPermission.create({
            data: {
              userBranchId: assignment.id,
              permissionId: permission.id,
              effect: code === 'orders.read' ? 'DENY' : 'ALLOW',
            },
          });
        }
      }
    }
    const product = await prisma.product.create({
      data: {
        name: 'Sách kiểm thử hỗ trợ Bookora',
        slug: run,
        status: 'ACTIVE',
      },
    });
    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: run,
        name: 'Bìa mềm',
        combinationKey: 'default',
        originalPrice: 120000,
        weightGram: 300,
        isDefault: true,
      },
    });
    const orders: Array<{ id: string; code: string; status: string }> = [];
    for (const [index, status] of (
      ['PENDING', 'COMPLETED', 'CANCELLED', 'PENDING_PAYMENT'] as const
    ).entries()) {
      const branch = branches[0];
      const order = await prisma.order.create({
        data: {
          orderCode: `HF1-${ulid()}`,
          userId: users.customer.id,
          branchId: branch.id,
          idempotencyKey: ulid(),
          status,
          subtotalAmount: 120000,
          totalAmount: 120000,
          shippingFee: 0,
          deliveryAddressSource: 'CURRENT_LOCATION',
          receiverName: 'Người nhận kiểm thử HF1',
          receiverPhone: '0900000000',
          shippingAddress: 'Địa chỉ fixture P2',
          shippingAddressLine: 'Địa chỉ fixture P2',
          shippingProvinceName: 'Thành phố Cần Thơ',
          shippingWardName: 'Phường Ninh Kiều',
          branchNameSnapshot: branch.name,
          branchAddressSnapshot: branch.address,
          shippingFeeBreakdownSnapshot: {},
          shippingQuoteReference: ulid(),
          placedAt: new Date(Date.now() - index * 1000),
          items: {
            create: {
              productId: product.id,
              variantId: variant.id,
              productName: product.name,
              productSlug: product.slug,
              variantLabel: variant.name,
              variantOptions: [],
              sku: variant.sku,
              quantity: 1,
              unitPrice: 120000,
              originalPrice: 120000,
              lineTotal: 120000,
            },
          },
          payment: {
            create: {
              method: 'COD',
              status: status === 'COMPLETED' ? 'PAID' : 'PENDING',
              amount: 120000,
            },
          },
        },
      });
      orders.push({ id: order.id, code: order.orderCode, status });
    }
    const directory = join(tmpdir(), 'bookora-support-hotfix1-evidence');
    mkdirSync(directory, { recursive: true });
    const fixture = {
      run,
      database: 'bookora_db',
      api: 'http://localhost:8000/api/v1',
      password,
      users,
      branches: branches.map((b) => ({ id: b.id, name: b.name })),
      orders,
      productId: product.id,
      variantId: variant.id,
    };
    writeFileSync(
      join(directory, 'fixtures-private.json'),
      JSON.stringify(fixture, null, 2),
    );
    console.log(
      JSON.stringify(
        {
          ready: true,
          database: fixture.database,
          users: Object.keys(users),
          branches: fixture.branches,
          orders,
          credentialFile: join(directory, 'fixtures-private.json'),
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}
void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Fixture failed');
  process.exitCode = 1;
});
