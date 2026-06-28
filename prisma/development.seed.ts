import * as bcrypt from 'bcrypt';
import { AuthProvider, Prisma, UserType } from '../src/generated/prisma/client';
import { seedCatalog } from './catalog.seed';

export const DEVELOPMENT_PASSWORD = 'password@123';

export const DEVELOPMENT_BRANCHES = [
  {
    code: 'can-tho',
    name: 'Chi nhánh Cần Thơ',
    phone: '0292 000 0001',
    address: 'Đường 30/4, phường Xuân Khánh, quận Ninh Kiều, Cần Thơ',
    province: 'Cần Thơ',
    district: 'Ninh Kiều',
    ward: 'Xuân Khánh',
  },
  {
    code: 'hau-giang',
    name: 'Chi nhánh Hậu Giang',
    phone: '0293 000 0001',
    address: 'Đường Trần Hưng Đạo, phường V, thành phố Vị Thanh, Hậu Giang',
    province: 'Hậu Giang',
    district: 'Vị Thanh',
    ward: 'Phường V',
  },
  {
    code: 'ho-chi-minh',
    name: 'Chi nhánh Hồ Chí Minh',
    phone: '028 0000 0001',
    address: 'Đường Nguyễn Huệ, phường Bến Nghé, Quận 1, Hồ Chí Minh',
    province: 'Hồ Chí Minh',
    district: 'Quận 1',
    ward: 'Bến Nghé',
  },
  {
    code: 'ha-noi',
    name: 'Chi nhánh Hà Nội',
    phone: '024 0000 0001',
    address: 'Phố Tràng Tiền, phường Tràng Tiền, quận Hoàn Kiếm, Hà Nội',
    province: 'Hà Nội',
    district: 'Hoàn Kiếm',
    ward: 'Tràng Tiền',
  },
] as const;

export const DEVELOPMENT_USERS = [
  {
    email: 'superadmin@bookora.local',
    fullName: 'Bookora Super Admin',
    type: UserType.SYSTEM,
    globalRole: 'SUPER_ADMIN',
    branches: [],
  },
  {
    email: 'branchadmin.hg@bookora.local',
    fullName: 'Branch Admin Hậu Giang',
    type: UserType.BRANCH,
    branches: [{ code: 'hau-giang', role: 'BRANCH_ADMIN', isPrimary: true }],
  },
  {
    email: 'branchadmin.ct@bookora.local',
    fullName: 'Branch Admin Cần Thơ',
    type: UserType.BRANCH,
    branches: [{ code: 'can-tho', role: 'BRANCH_ADMIN', isPrimary: true }],
  },
  {
    email: 'staff.ct@bookora.local',
    fullName: 'Staff Cần Thơ',
    type: UserType.BRANCH,
    branches: [{ code: 'can-tho', role: 'STAFF', isPrimary: true }],
  },
  {
    email: 'staff.multi@bookora.local',
    fullName: 'Staff Multi Branch',
    type: UserType.BRANCH,
    branches: [
      { code: 'can-tho', role: 'STAFF', isPrimary: true },
      { code: 'hau-giang', role: 'INVENTORY', isPrimary: false },
    ],
  },
] as const;

export function assertDevelopmentSeedAllowed(env: NodeJS.ProcessEnv): void {
  if (env.NODE_ENV === 'production') {
    throw new Error(
      'Refusing to run development seed when NODE_ENV=production',
    );
  }

  if (env.ALLOW_DEV_SEED !== 'true') {
    throw new Error(
      'Refusing to run development seed without ALLOW_DEV_SEED=true',
    );
  }
}

type DevelopmentSeedClient = Prisma.TransactionClient;
type DevelopmentSeedRunner = {
  $transaction<T>(
    callback: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T>;
};

export async function seedDevelopmentFixtures(
  prisma: DevelopmentSeedRunner,
): Promise<void> {
  const passwordHash = await bcrypt.hash(DEVELOPMENT_PASSWORD, 12);

  await prisma.$transaction(async (tx) => {
    await seedCatalog(tx);

    const rolesByCode = await resolveRequiredRoles(tx);
    const branchesByCode = await upsertBranches(tx);
    const usersByEmail = await upsertUsers(tx, passwordHash);
    const superAdmin = requiredMapValue(
      usersByEmail,
      'superadmin@bookora.local',
      'Fixture user not found: superadmin@bookora.local',
    );

    await reconcileSuperAdmin(
      tx,
      superAdmin.id,
      rolesByCode.get('SUPER_ADMIN')!.id,
    );

    for (const userFixture of DEVELOPMENT_USERS.filter(
      (user) => user.type === UserType.BRANCH,
    )) {
      const user = requiredMapValue(
        usersByEmail,
        userFixture.email,
        `Fixture user not found: ${userFixture.email}`,
      );
      await reconcileBranchUser({
        tx,
        userId: user.id,
        assignedBy: superAdmin.id,
        branchesByCode,
        rolesByCode,
        assignments: userFixture.branches,
      });
    }

    await verifyDevelopmentInvariants(tx);
  });
}

async function resolveRequiredRoles(tx: DevelopmentSeedClient) {
  const requiredCodes = ['SUPER_ADMIN', 'BRANCH_ADMIN', 'STAFF', 'INVENTORY'];
  const roles = await tx.role.findMany({
    where: { code: { in: requiredCodes }, isActive: true },
    select: { id: true, code: true },
  });
  const rolesByCode = new Map(roles.map((role) => [role.code, role]));

  for (const code of requiredCodes) {
    if (!rolesByCode.has(code)) {
      throw new Error(
        `Required catalog role ${code} is missing. Run the catalog seed first.`,
      );
    }
  }

  return rolesByCode;
}

async function upsertBranches(tx: DevelopmentSeedClient) {
  const branchesByCode = new Map<string, { id: string; code: string }>();
  for (const branch of DEVELOPMENT_BRANCHES) {
    const persistedBranch = await tx.branch.upsert({
      where: { code: branch.code },
      create: { ...branch, isActive: true },
      update: { ...branch, isActive: true },
      select: { id: true, code: true },
    });
    branchesByCode.set(persistedBranch.code, persistedBranch);
  }
  return branchesByCode;
}

async function upsertUsers(tx: DevelopmentSeedClient, passwordHash: string) {
  const usersByEmail = new Map<string, { id: string; email: string }>();
  for (const user of DEVELOPMENT_USERS) {
    const persistedUser = await tx.user.upsert({
      where: { email: user.email },
      create: {
        email: user.email,
        fullName: user.fullName,
        passwordHash,
        provider: AuthProvider.LOCAL,
        type: user.type,
        isActive: true,
        googleId: null,
      },
      update: {
        fullName: user.fullName,
        passwordHash,
        provider: AuthProvider.LOCAL,
        type: user.type,
        isActive: true,
        googleId: null,
      },
      select: { id: true, email: true },
    });
    usersByEmail.set(persistedUser.email, persistedUser);
  }
  return usersByEmail;
}

async function reconcileSuperAdmin(
  tx: DevelopmentSeedClient,
  userId: string,
  superAdminRoleId: string,
) {
  await tx.userBranch.deleteMany({ where: { userId } });
  await tx.userPermission.deleteMany({ where: { userId } });
  await tx.userRole.deleteMany({
    where: { userId, roleId: { not: superAdminRoleId } },
  });
  await tx.userRole.upsert({
    where: { userId_roleId: { userId, roleId: superAdminRoleId } },
    create: { userId, roleId: superAdminRoleId },
    update: {},
  });
}

async function reconcileBranchUser(input: {
  tx: DevelopmentSeedClient;
  userId: string;
  assignedBy: string;
  branchesByCode: Map<string, { id: string; code: string }>;
  rolesByCode: Map<string, { id: string; code: string }>;
  assignments: readonly {
    code: string;
    role: string;
    isPrimary: boolean;
  }[];
}) {
  const expectedBranchIds = input.assignments.map(
    (assignment) =>
      requiredMapValue(
        input.branchesByCode,
        assignment.code,
        `Fixture branch not found: ${assignment.code}`,
      ).id,
  );

  await input.tx.userRole.deleteMany({ where: { userId: input.userId } });
  await input.tx.userPermission.deleteMany({ where: { userId: input.userId } });

  const staleAssignments = await input.tx.userBranch.findMany({
    where: {
      userId: input.userId,
      branchId: { notIn: expectedBranchIds },
    },
    select: { id: true },
  });
  await input.tx.userBranch.deleteMany({
    where: { id: { in: staleAssignments.map((assignment) => assignment.id) } },
  });

  await input.tx.userBranch.updateMany({
    where: { userId: input.userId },
    data: { isPrimary: false },
  });

  for (const assignment of input.assignments) {
    const branch = requiredMapValue(
      input.branchesByCode,
      assignment.code,
      `Fixture branch not found: ${assignment.code}`,
    );
    const role = requiredMapValue(
      input.rolesByCode,
      assignment.role,
      `Fixture role not found: ${assignment.role}`,
    );
    const userBranch = await input.tx.userBranch.upsert({
      where: {
        userId_branchId: { userId: input.userId, branchId: branch.id },
      },
      create: {
        userId: input.userId,
        branchId: branch.id,
        isPrimary: assignment.isPrimary,
        isActive: true,
        assignedBy: input.assignedBy,
      },
      update: {
        isPrimary: assignment.isPrimary,
        isActive: true,
        assignedBy: input.assignedBy,
        assignedAt: new Date(),
      },
      select: { id: true },
    });

    await input.tx.userBranchPermission.deleteMany({
      where: { userBranchId: userBranch.id },
    });
    await input.tx.userBranchRole.deleteMany({
      where: { userBranchId: userBranch.id, roleId: { not: role.id } },
    });
    await input.tx.userBranchRole.upsert({
      where: {
        userBranchId_roleId: {
          userBranchId: userBranch.id,
          roleId: role.id,
        },
      },
      create: {
        userBranchId: userBranch.id,
        roleId: role.id,
        assignedBy: input.assignedBy,
      },
      update: { assignedBy: input.assignedBy, assignedAt: new Date() },
    });
  }
}

async function verifyDevelopmentInvariants(tx: DevelopmentSeedClient) {
  const fixtureEmails = DEVELOPMENT_USERS.map((user) => user.email);
  const fixtureBranchCodes = DEVELOPMENT_BRANCHES.map((branch) => branch.code);

  const [branchCount, userCount, runtimeAuthCount] = await Promise.all([
    tx.branch.count({
      where: { code: { in: fixtureBranchCodes }, isActive: true },
    }),
    tx.user.count({ where: { email: { in: fixtureEmails }, isActive: true } }),
    tx.authSession.count({ where: { user: { email: { in: fixtureEmails } } } }),
  ]);

  if (branchCount !== DEVELOPMENT_BRANCHES.length) {
    throw new Error(
      'Development seed invariant failed: expected 4 active branches',
    );
  }
  if (userCount !== DEVELOPMENT_USERS.length) {
    throw new Error(
      'Development seed invariant failed: expected 5 active users',
    );
  }
  if (runtimeAuthCount !== 0) {
    throw new Error(
      'Development seed invariant failed: AuthSession rows exist',
    );
  }

  const branchUsers = await tx.user.findMany({
    where: {
      email: {
        in: DEVELOPMENT_USERS.filter(
          (user) => user.type === UserType.BRANCH,
        ).map((user) => user.email),
      },
    },
    select: {
      id: true,
      email: true,
      userRoles: { select: { role: { select: { code: true } } } },
      userBranches: {
        where: { isActive: true },
        select: { isPrimary: true },
      },
    },
  });

  for (const user of branchUsers) {
    if (user.userRoles.length > 0) {
      throw new Error(
        `Development seed invariant failed: ${user.email} has global roles`,
      );
    }
    const primaryCount = user.userBranches.filter(
      (branch) => branch.isPrimary,
    ).length;
    if (primaryCount !== 1) {
      throw new Error(
        `Development seed invariant failed: ${user.email} must have one primary branch`,
      );
    }
  }
}

function requiredMapValue<TKey, TValue>(
  map: Map<TKey, TValue>,
  key: TKey,
  message: string,
): TValue {
  const value = map.get(key);
  if (!value) {
    throw new Error(message);
  }
  return value;
}
