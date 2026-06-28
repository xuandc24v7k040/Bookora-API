import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, UserType } from '../src/generated/prisma/client';
import {
  DEVELOPMENT_PASSWORD,
  DEVELOPMENT_USERS,
  assertDevelopmentSeedAllowed,
  seedDevelopmentFixtures,
} from '../prisma/development.seed';
import {
  createDisposablePostgresDatabase,
  runMigrations,
  type DisposablePostgresDatabase,
} from './helpers/postgres-test-database';

const BRANCH_CODES = ['can-tho', 'hau-giang', 'ho-chi-minh', 'ha-noi'];
const FIXTURE_EMAILS = DEVELOPMENT_USERS.map((user) => user.email);
const BRANCH_USER_EMAILS = DEVELOPMENT_USERS.filter(
  (user) => user.type === UserType.BRANCH,
).map((user) => user.email);

describe('development seed fixtures (e2e)', () => {
  jest.setTimeout(120_000);

  it('refuses unsafe environments', () => {
    expect(() =>
      assertDevelopmentSeedAllowed({
        NODE_ENV: 'production',
        ALLOW_DEV_SEED: 'true',
      }),
    ).toThrow('NODE_ENV=production');
    expect(() =>
      assertDevelopmentSeedAllowed({ NODE_ENV: 'development' }),
    ).toThrow('ALLOW_DEV_SEED=true');
  });

  it('seeds branch and user fixtures idempotently', async () => {
    const database = await createDisposablePostgresDatabase('dev_seed');
    let prisma: PrismaClient | undefined;

    try {
      await runMigrations(database);
      prisma = createPrisma(database);
      await prisma.$connect();
      const outsider = await prisma.user.create({
        data: {
          email: 'outside.fixture@example.test',
          fullName: 'Outside Fixture User',
          type: UserType.CUSTOMER,
          passwordHash: 'unchanged-hash',
        },
        select: { id: true, email: true, passwordHash: true },
      });

      await seedDevelopmentFixtures(prisma);
      await seedDevelopmentFixtures(prisma);

      await expectCommonFixtures(prisma);
      await expectSuperAdmin(prisma);
      await expectBranchAdminHauGiang(prisma);
      await expectBranchAdminCanTho(prisma);
      await expectStaffCanTho(prisma);
      await expectStaffMulti(prisma);
      await expectPasswords(prisma);
      await expectNoRuntimeAuthData(prisma);
      await expectNoUnwantedBranchAdmins(prisma);

      await expect(
        prisma.user.findUniqueOrThrow({
          where: { id: outsider.id },
          select: { email: true, passwordHash: true },
        }),
      ).resolves.toEqual({
        email: outsider.email,
        passwordHash: outsider.passwordHash,
      });
    } finally {
      await prisma?.$disconnect();
      await database.close();
    }
  });
});

function createPrisma(database: DisposablePostgresDatabase): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: database.databaseUrl }),
  });
}

async function expectCommonFixtures(prisma: PrismaClient): Promise<void> {
  await expect(
    prisma.branch.count({
      where: { code: { in: BRANCH_CODES }, isActive: true },
    }),
  ).resolves.toBe(4);
  await expect(
    prisma.user.count({
      where: { email: { in: FIXTURE_EMAILS }, isActive: true },
    }),
  ).resolves.toBe(5);
  await expect(
    prisma.userBranch.count({
      where: { user: { email: { in: FIXTURE_EMAILS } } },
    }),
  ).resolves.toBe(5);
  await expect(
    prisma.userBranchRole.count({
      where: { userBranch: { user: { email: { in: FIXTURE_EMAILS } } } },
    }),
  ).resolves.toBe(5);
  await expect(
    prisma.userBranchPermission.count({
      where: { userBranch: { user: { email: { in: FIXTURE_EMAILS } } } },
    }),
  ).resolves.toBe(0);
}

async function expectSuperAdmin(prisma: PrismaClient): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: 'superadmin@bookora.local' },
    select: {
      type: true,
      userRoles: { select: { role: { select: { code: true } } } },
      userBranches: true,
    },
  });

  expect(user.type).toBe(UserType.SYSTEM);
  expect(user.userRoles.map(({ role }) => role.code)).toEqual(['SUPER_ADMIN']);
  expect(user.userBranches).toEqual([]);
}

async function expectBranchAdminHauGiang(prisma: PrismaClient): Promise<void> {
  await expectSingleBranchUser(prisma, {
    email: 'branchadmin.hg@bookora.local',
    branchCode: 'hau-giang',
    roleCode: 'BRANCH_ADMIN',
  });
}

async function expectBranchAdminCanTho(prisma: PrismaClient): Promise<void> {
  await expectSingleBranchUser(prisma, {
    email: 'branchadmin.ct@bookora.local',
    branchCode: 'can-tho',
    roleCode: 'BRANCH_ADMIN',
  });
}

async function expectStaffCanTho(prisma: PrismaClient): Promise<void> {
  await expectSingleBranchUser(prisma, {
    email: 'staff.ct@bookora.local',
    branchCode: 'can-tho',
    roleCode: 'STAFF',
  });
}

async function expectSingleBranchUser(
  prisma: PrismaClient,
  input: { email: string; branchCode: string; roleCode: string },
): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: input.email },
    select: {
      type: true,
      userRoles: true,
      userBranches: {
        select: {
          isPrimary: true,
          isActive: true,
          branch: { select: { code: true } },
          roles: { select: { role: { select: { code: true } } } },
        },
      },
    },
  });

  expect(user.type).toBe(UserType.BRANCH);
  expect(user.userRoles).toEqual([]);
  expect(user.userBranches).toHaveLength(1);
  expect(user.userBranches[0]).toMatchObject({
    isPrimary: true,
    isActive: true,
    branch: { code: input.branchCode },
  });
  expect(user.userBranches[0].roles.map(({ role }) => role.code)).toEqual([
    input.roleCode,
  ]);
}

async function expectStaffMulti(prisma: PrismaClient): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: 'staff.multi@bookora.local' },
    select: {
      type: true,
      userRoles: true,
      userBranches: {
        orderBy: { branch: { code: 'asc' } },
        select: {
          isPrimary: true,
          isActive: true,
          branch: { select: { code: true } },
          roles: { select: { role: { select: { code: true } } } },
        },
      },
    },
  });

  expect(user.type).toBe(UserType.BRANCH);
  expect(user.userRoles).toEqual([]);
  expect(user.userBranches).toHaveLength(2);
  expect(
    user.userBranches.map((assignment) => ({
      branch: assignment.branch.code,
      primary: assignment.isPrimary,
      active: assignment.isActive,
      roles: assignment.roles.map(({ role }) => role.code),
    })),
  ).toEqual([
    { branch: 'can-tho', primary: true, active: true, roles: ['STAFF'] },
    {
      branch: 'hau-giang',
      primary: false,
      active: true,
      roles: ['INVENTORY'],
    },
  ]);
  expect(
    user.userBranches.filter((assignment) => assignment.isPrimary),
  ).toHaveLength(1);
}

async function expectPasswords(prisma: PrismaClient): Promise<void> {
  const users = await prisma.user.findMany({
    where: { email: { in: FIXTURE_EMAILS } },
    select: { email: true, passwordHash: true },
  });

  expect(users).toHaveLength(5);
  for (const user of users) {
    expect(user.passwordHash).toEqual(expect.any(String));
    await expect(
      bcrypt.compare(DEVELOPMENT_PASSWORD, user.passwordHash ?? ''),
    ).resolves.toBe(true);
  }
}

async function expectNoRuntimeAuthData(prisma: PrismaClient): Promise<void> {
  await expect(
    prisma.authSession.count({
      where: { user: { email: { in: FIXTURE_EMAILS } } },
    }),
  ).resolves.toBe(0);
  await expect(
    prisma.authAttempt.count({
      where: { key: { in: FIXTURE_EMAILS } },
    }),
  ).resolves.toBe(0);
}

async function expectNoUnwantedBranchAdmins(
  prisma: PrismaClient,
): Promise<void> {
  await expect(
    prisma.userBranchRole.count({
      where: {
        role: { code: 'BRANCH_ADMIN' },
        userBranch: { branch: { code: { in: ['ho-chi-minh', 'ha-noi'] } } },
      },
    }),
  ).resolves.toBe(0);
  await expect(
    prisma.userRole.count({
      where: {
        user: { email: { in: BRANCH_USER_EMAILS } },
        role: { code: { in: ['BRANCH_ADMIN', 'STAFF', 'INVENTORY'] } },
      },
    }),
  ).resolves.toBe(0);
}
