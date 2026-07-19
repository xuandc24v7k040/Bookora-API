import {
  Controller,
  Get,
  INestApplication,
  Module,
  UseGuards,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { setupApplication } from '../src/core/app.setup';
import { PrismaService } from '../src/database/prisma.service';
import {
  AuthProvider,
  OrderStatus,
  PermissionEffect,
  UserType,
} from '../src/generated/prisma/client';
import { JwtAccessGuard } from '../src/modules/auth/guards/jwt-access.guard';
import { CsrfGuard } from '../src/modules/auth/guards/csrf.guard';
import {
  AuthorizationModule,
  BranchScope,
  BranchScopeGuard,
  BranchScopeMode,
  Permissions,
  PermissionsGuard,
} from '../src/modules/authorization';
import {
  createDisposablePostgresDatabase,
  type DisposablePostgresDatabase,
  runMigrations,
} from './helpers/postgres-test-database';

const API = '/api/v1';
const CSRF = 'csrf-e2e-token';

const IDS = {
  hauGiang: '01K10000000000000000000001',
  canTho: '01K10000000000000000000002',
  vinhLong: '01K1000000000000000000000S',
  inactiveBranch: '01K1000000000000000000000T',
  superAdmin: '01K10000000000000000000003',
  adminHauGiang: '01K10000000000000000000004',
  adminCanTho: '01K10000000000000000000005',
  staffMulti: '01K10000000000000000000006',
  staffLastBranch: '01K10000000000000000000007',
  transferNewDestination: '01K1000000000000000000000X',
  transferInactiveDestination: '01K1000000000000000000000Y',
  transferNonPrimary: '01K1000000000000000000000Z',
  transferRollbackAfterWrite: '01K10000000000000000000010',
  transferConcurrent: '01K10000000000000000000011',
  transferNoHeader: '01K10000000000000000000012',
  staffCandidate: '01K10000000000000000000014',
  customer: '01K10000000000000000000008',
  rollbackCustomer: '01K1000000000000000000000V',
  order: '01K10000000000000000000009',
  superAdminRole: '01JZ0000000000000000000001',
  branchAdminRole: '01JZ0000000000000000000002',
  customerRole: '01JZ0000000000000000000003',
  staffRole: '01K1000000000000000000000A',
  cashierRole: '01K1000000000000000000000B',
  staffRead: '01K1000000000000000000000C',
  staffUpdate: '01K1000000000000000000000D',
  staffDelete: '01K1000000000000000000000E',
  staffAssignRole: '01K1000000000000000000000F',
  staffAssignPermission: '01K1000000000000000000000G',
  staffAssignBranch: '01K1000000000000000000000H',
  branchesAssign: '01K1000000000000000000000J',
  branchesRead: '01K10000000000000000000013',
  staffCreate: '01K1000000000000000000000K',
  usersUpdate: '01K1000000000000000000000M',
  usersDelete: '01K1000000000000000000000N',
  inventoryUpdate: '01K1000000000000000000000P',
  paymentsCreate: '01K1000000000000000000000Q',
  legacyUsersDelete: '01K1000000000000000000000R',
  peerRole: '01K1000000000000000000000W',
} as const;

interface AuthCookies {
  readonly cookie: string;
  readonly csrfCookie: string;
}

interface Fixture {
  readonly bHauGiangUserBranchId: string;
  readonly bCanThoUserBranchId: string;
}

@Controller('probe')
@UseGuards(JwtAccessGuard, CsrfGuard, BranchScopeGuard, PermissionsGuard)
class PermissionProbeController {
  @Get('inventory')
  @BranchScope(BranchScopeMode.REQUIRED_SELECTION)
  @Permissions('inventory.update')
  inventory() {
    return { ok: true };
  }

  @Get('payments')
  @BranchScope(BranchScopeMode.REQUIRED_SELECTION)
  @Permissions('payments.create')
  payments() {
    return { ok: true };
  }
}

@Module({
  imports: [AuthorizationModule],
  controllers: [PermissionProbeController],
  providers: [JwtAccessGuard, CsrfGuard],
})
class PermissionProbeModule {}

describe('branch-scoped authorization API matrix (e2e)', () => {
  jest.setTimeout(120_000);

  let database: DisposablePostgresDatabase;
  let moduleFixture: TestingModule;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let fixture: Fixture;
  let superAdminAuth: AuthCookies;
  let adminHauGiangAuth: AuthCookies;
  let adminCanThoAuth: AuthCookies;
  let staffAuth: AuthCookies;

  beforeAll(async () => {
    database = await createDisposablePostgresDatabase('cross_branch_api');
    await runMigrations(database);

    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = database.databaseUrl;
    process.env.JWT_ACCESS_SECRET = 'cross-branch-access-secret';
    process.env.JWT_REFRESH_SECRET = 'cross-branch-refresh-secret';
    process.env.REFRESH_TOKEN_HASH_SECRET = 'cross-branch-refresh-hash';
    process.env.TURNSTILE_ENABLED = 'false';

    moduleFixture = await Test.createTestingModule({
      imports: [AppModule, PermissionProbeModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    setupApplication(app);
    await app.init();

    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);
    fixture = await seedCrossBranchFixture(prisma);

    superAdminAuth = await createAuth(prisma, jwtService, IDS.superAdmin);
    adminHauGiangAuth = await createAuth(prisma, jwtService, IDS.adminHauGiang);
    adminCanThoAuth = await createAuth(prisma, jwtService, IDS.adminCanTho);
    staffAuth = await createAuth(prisma, jwtService, IDS.staffMulti);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (database) {
      await database.close();
    }
  });

  it('resolves selected-branch permissions without global legacy leakage or cross-branch DENY leakage', async () => {
    await request(app.getHttpServer())
      .get(`${API}/probe/inventory`)
      .set('Cookie', staffAuth.cookie)
      .expect(400);

    await request(app.getHttpServer())
      .get(`${API}/probe/inventory`)
      .set('Cookie', adminHauGiangAuth.cookie)
      .set('X-Branch-Id', IDS.canTho)
      .expect(403);

    await request(app.getHttpServer())
      .get(`${API}/probe/inventory`)
      .set('Cookie', staffAuth.cookie)
      .set('X-Branch-Id', IDS.hauGiang)
      .expect(200);

    await request(app.getHttpServer())
      .get(`${API}/probe/payments`)
      .set('Cookie', staffAuth.cookie)
      .set('X-Branch-Id', IDS.hauGiang)
      .expect(403);

    await request(app.getHttpServer())
      .get(`${API}/probe/payments`)
      .set('Cookie', staffAuth.cookie)
      .set('X-Branch-Id', IDS.canTho)
      .expect(200);

    await request(app.getHttpServer())
      .get(`${API}/probe/inventory`)
      .set('Cookie', staffAuth.cookie)
      .set('X-Branch-Id', IDS.canTho)
      .expect(403);

    await request(app.getHttpServer())
      .delete(`${API}/users/${IDS.adminCanTho}`)
      .set('Cookie', withCsrf(staffAuth))
      .set('X-CSRF-Token', CSRF)
      .expect(403);

    const me = await request(app.getHttpServer())
      .get(`${API}/auth/me`)
      .set('Cookie', staffAuth.cookie)
      .expect(200);
    expect(me.body.data).toEqual(
      expect.objectContaining({
        phone: null,
        gender: null,
        birthday: null,
      }),
    );
    expect(me.body.data.globalRoles).toEqual([]);
    expect(me.body.data.globalPermissions).toEqual([]);
    expect(me.body.data.branchAssignments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          branchId: IDS.hauGiang,
          permissions: expect.arrayContaining(['inventory.update']),
          maxRoleLevel: 10,
        }),
        expect.objectContaining({
          branchId: IDS.canTho,
          permissions: expect.arrayContaining(['payments.create']),
          maxRoleLevel: 5,
        }),
      ]),
    );
  });

  it('keeps a persistent Branch Admin registry and separates Staff-only assignments', async () => {
    const candidateZeroId = '01K20000000000000000000001';
    const formerAdminId = '01K20000000000000000000002';
    const candidateStaffId = '01K20000000000000000000003';
    const staffOnlyId = '01K20000000000000000000004';
    const ids = [candidateZeroId, formerAdminId, candidateStaffId, staffOnlyId];

    try {
      await prisma.user.create({
        data: {
          id: candidateZeroId,
          email: 'registry-hotfix-zero@bookora.local',
          fullName: 'Registry Hotfix Zero',
          passwordHash: 'test-only',
          provider: AuthProvider.LOCAL,
          type: UserType.BRANCH,
          userRoles: {
            create: {
              roleId: IDS.branchAdminRole,
              assignedBy: IDS.superAdmin,
            },
          },
        },
      });
      await prisma.user.create({
        data: {
          id: formerAdminId,
          email: 'registry-hotfix-former@bookora.local',
          fullName: 'Registry Hotfix Former',
          passwordHash: 'test-only',
          provider: AuthProvider.LOCAL,
          type: UserType.BRANCH,
          userRoles: {
            create: {
              roleId: IDS.branchAdminRole,
              assignedBy: IDS.superAdmin,
            },
          },
          userBranches: {
            create: {
              branchId: IDS.hauGiang,
              assignedBy: IDS.superAdmin,
              roles: {
                create: {
                  roleId: IDS.branchAdminRole,
                  assignedBy: IDS.superAdmin,
                },
              },
            },
          },
        },
      });
      await prisma.userBranch.deleteMany({ where: { userId: formerAdminId } });
      for (const [id, marker] of [
        [candidateStaffId, true],
        [staffOnlyId, false],
      ] as const) {
        await prisma.user.create({
          data: {
            id,
            email: `registry-hotfix-${marker ? 'candidate-staff' : 'staff-only'}@bookora.local`,
            fullName: marker
              ? 'Registry Hotfix Candidate Staff'
              : 'Registry Hotfix Staff Only',
            passwordHash: 'test-only',
            provider: AuthProvider.LOCAL,
            type: UserType.BRANCH,
            ...(marker
              ? {
                  userRoles: {
                    create: {
                      roleId: IDS.branchAdminRole,
                      assignedBy: IDS.superAdmin,
                    },
                  },
                }
              : {}),
            userBranches: {
              create: {
                branchId: IDS.hauGiang,
                assignedBy: IDS.superAdmin,
                isPrimary: true,
                roles: {
                  create: {
                    roleId: IDS.staffRole,
                    assignedBy: IDS.superAdmin,
                  },
                },
              },
            },
          },
        });
      }

      const registry = await request(app.getHttpServer())
        .get(`${API}/branch-admins?search=registry-hotfix&limit=20`)
        .set('Cookie', superAdminAuth.cookie)
        .expect(200);
      const registryById = new Map(
        (
          registry.body.data as Array<{ id: string; userBranches: unknown[] }>
        ).map((item) => [item.id, item]),
      );
      expect(registryById.has(staffOnlyId)).toBe(false);
      expect(registryById.get(candidateZeroId)?.userBranches).toHaveLength(0);
      expect(registryById.get(formerAdminId)?.userBranches).toHaveLength(0);
      expect(registryById.get(candidateStaffId)?.userBranches).toHaveLength(0);

      const detail = await request(app.getHttpServer())
        .get(`${API}/branch-admins/${candidateStaffId}`)
        .set('Cookie', superAdminAuth.cookie)
        .expect(200);
      expect(detail.body.data.userBranches).toEqual([
        expect.objectContaining({
          branchId: IDS.hauGiang,
          roles: [
            expect.objectContaining({
              role: expect.objectContaining({ code: 'STAFF' }),
            }),
          ],
        }),
      ]);

      await request(app.getHttpServer())
        .delete(`${API}/branch-admins/${staffOnlyId}/branches/${IDS.hauGiang}`)
        .set('Cookie', withCsrf(superAdminAuth))
        .set('X-CSRF-Token', CSRF)
        .send({})
        .expect(404);
      expect(
        await prisma.userBranchRole.count({
          where: {
            userBranch: { userId: staffOnlyId, branchId: IDS.hauGiang },
            roleId: IDS.staffRole,
          },
        }),
      ).toBe(1);

      await request(app.getHttpServer())
        .post(
          `${API}/branch-admins/${candidateStaffId}/branches/${IDS.hauGiang}`,
        )
        .set('Cookie', withCsrf(superAdminAuth))
        .set('X-CSRF-Token', CSRF)
        .expect(201);
      expect(
        await prisma.userBranchRole.count({
          where: {
            userBranch: { userId: candidateStaffId, branchId: IDS.hauGiang },
          },
        }),
      ).toBe(2);

      await request(app.getHttpServer())
        .delete(
          `${API}/branch-admins/${candidateStaffId}/branches/${IDS.hauGiang}`,
        )
        .set('Cookie', withCsrf(superAdminAuth))
        .set('X-CSRF-Token', CSRF)
        .send({})
        .expect(200);
      const remainingRoles = await prisma.userBranchRole.findMany({
        where: {
          userBranch: { userId: candidateStaffId, branchId: IDS.hauGiang },
        },
        select: { role: { select: { code: true } } },
      });
      expect(remainingRoles.map(({ role }) => role.code)).toEqual(['STAFF']);
    } finally {
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
    }
  });

  it('enforces effective staff.read per selected branch and inactive states', async () => {
    const me = await request(app.getHttpServer())
      .get(`${API}/auth/me`)
      .set('Cookie', staffAuth.cookie)
      .expect(200);
    const assignments = me.body.data.branchAssignments as Array<{
      branchId: string;
      permissions: string[];
    }>;
    expect(
      assignments.find(({ branchId }) => branchId === IDS.canTho)?.permissions,
    ).toContain('staff.read');
    expect(
      assignments.find(({ branchId }) => branchId === IDS.hauGiang)
        ?.permissions,
    ).not.toContain('staff.read');

    await request(app.getHttpServer())
      .get(`${API}/staff`)
      .set('Cookie', staffAuth.cookie)
      .set('X-Branch-Id', IDS.canTho)
      .expect(200);
    await request(app.getHttpServer())
      .get(`${API}/staff`)
      .set('Cookie', staffAuth.cookie)
      .set('X-Branch-Id', IDS.hauGiang)
      .expect(403);
    await request(app.getHttpServer())
      .get(`${API}/staff`)
      .set('Cookie', adminHauGiangAuth.cookie)
      .set('X-Branch-Id', IDS.hauGiang)
      .expect(200);

    try {
      await prisma.user.update({
        where: { id: IDS.staffMulti },
        data: { isActive: false },
      });
      await request(app.getHttpServer())
        .get(`${API}/staff`)
        .set('Cookie', staffAuth.cookie)
        .set('X-Branch-Id', IDS.canTho)
        .expect(401);
    } finally {
      await prisma.user.update({
        where: { id: IDS.staffMulti },
        data: { isActive: true },
      });
    }

    try {
      await prisma.userBranch.update({
        where: { id: fixture.bCanThoUserBranchId },
        data: { isActive: false },
      });
      await request(app.getHttpServer())
        .get(`${API}/staff`)
        .set('Cookie', staffAuth.cookie)
        .set('X-Branch-Id', IDS.canTho)
        .expect(403);
    } finally {
      await prisma.userBranch.update({
        where: { id: fixture.bCanThoUserBranchId },
        data: { isActive: true },
      });
    }

    try {
      await prisma.branch.update({
        where: { id: IDS.canTho },
        data: { isActive: false },
      });
      await request(app.getHttpServer())
        .get(`${API}/staff`)
        .set('Cookie', staffAuth.cookie)
        .set('X-Branch-Id', IDS.canTho)
        .expect(404);
    } finally {
      await prisma.branch.update({
        where: { id: IDS.canTho },
        data: { isActive: true },
      });
    }
  });

  it('allows add-existing only for Super Admin while Branch Admin can create new Staff', async () => {
    await request(app.getHttpServer())
      .get(`${API}/staff/candidates`)
      .set('Cookie', adminHauGiangAuth.cookie)
      .set('X-Branch-Id', IDS.hauGiang)
      .expect(403)
      .expect(({ body }) => expect(body.code).toBe('PERMISSION_DENIED'));
    await request(app.getHttpServer())
      .post(`${API}/staff/${IDS.staffCandidate}/assign-existing`)
      .set('Cookie', withCsrf(adminHauGiangAuth))
      .set('X-CSRF-Token', CSRF)
      .set('X-Branch-Id', IDS.hauGiang)
      .send({ roleIds: [IDS.staffRole] })
      .expect(403);
    await request(app.getHttpServer())
      .post(`${API}/staff`)
      .set('Cookie', withCsrf(adminHauGiangAuth))
      .set('X-CSRF-Token', CSRF)
      .set('X-Branch-Id', IDS.hauGiang)
      .send({
        fullName: 'Branch-created Staff',
        email: 'branch-created.staff@example.test',
        password: 'Password@123',
        roleIds: [IDS.staffRole],
      })
      .expect(201);

    await request(app.getHttpServer())
      .get(`${API}/staff/candidates`)
      .set('Cookie', superAdminAuth.cookie)
      .set('X-Branch-Id', IDS.hauGiang)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ id: IDS.staffCandidate }),
          ]),
        );
      });
    await request(app.getHttpServer())
      .post(`${API}/staff/${IDS.staffCandidate}/assign-existing`)
      .set('Cookie', withCsrf(superAdminAuth))
      .set('X-CSRF-Token', CSRF)
      .set('X-Branch-Id', IDS.hauGiang)
      .send({ roleIds: [IDS.staffRole] })
      .expect(201);
  });

  it('serves the actor-aware assignable Staff role catalog without roles.read', async () => {
    for (const action of ['CREATE', 'ASSIGN']) {
      await request(app.getHttpServer())
        .get(`${API}/staff/assignable-roles`)
        .query({ action, page: 1, limit: 100 })
        .set('Cookie', adminHauGiangAuth.cookie)
        .set('X-Branch-Id', IDS.hauGiang)
        .expect(200)
        .expect(({ body }) => {
          expect(body.data).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                id: IDS.staffRole,
                code: 'STAFF',
                rolePermissions: expect.any(Array),
              }),
              expect.objectContaining({
                id: IDS.cashierRole,
                code: 'CASHIER',
                rolePermissions: expect.any(Array),
              }),
            ]),
          );
          expect(
            body.data.some((role: { code: string }) =>
              ['SUPER_ADMIN', 'BRANCH_ADMIN', 'CUSTOMER'].includes(role.code),
            ),
          ).toBe(false);
        });
    }

    await request(app.getHttpServer())
      .get(`${API}/staff/assignable-roles`)
      .query({ action: 'ASSIGN' })
      .set('Cookie', adminHauGiangAuth.cookie)
      .set('X-Branch-Id', IDS.canTho)
      .expect(403);

    await request(app.getHttpServer())
      .get(`${API}/staff/assignable-roles`)
      .query({ action: 'ASSIGN' })
      .set('Cookie', staffAuth.cookie)
      .set('X-Branch-Id', IDS.canTho)
      .expect(403);
  });

  it('serves only actor-delegatable business permissions for Staff', async () => {
    await request(app.getHttpServer())
      .get(`${API}/staff/assignable-permissions`)
      .query({ page: 1, limit: 100 })
      .set('Cookie', adminHauGiangAuth.cookie)
      .set('X-Branch-Id', IDS.hauGiang)
      .expect(200)
      .expect(({ body }) => {
        const codes = body.data.map(({ code }: { code: string }) => code);
        expect(codes).toContain('staff.read');
        expect(codes).not.toEqual(
          expect.arrayContaining([
            'staff.assign_permission',
            'staff.assign_role',
            'staff.create',
          ]),
        );
      });

    await request(app.getHttpServer())
      .get(`${API}/staff/assignable-permissions`)
      .query({ page: 1, limit: 100 })
      .set('Cookie', superAdminAuth.cookie)
      .set('X-Branch-Id', IDS.canTho)
      .expect(200)
      .expect(({ body }) => {
        const codes = body.data.map(({ code }: { code: string }) => code);
        expect(codes).toEqual(
          expect.arrayContaining([
            'staff.read',
            'inventory.update',
            'payments.create',
          ]),
        );
        expect(codes).not.toContain('branches.read');
      });

    await request(app.getHttpServer())
      .get(`${API}/staff/assignable-permissions`)
      .set('Cookie', adminHauGiangAuth.cookie)
      .set('X-Branch-Id', IDS.canTho)
      .expect(403);

    await request(app.getHttpServer())
      .put(`${API}/staff/${IDS.staffMulti}/permissions/${IDS.branchesRead}`)
      .set('Cookie', withCsrf(superAdminAuth))
      .set('X-CSRF-Token', CSRF)
      .set('X-Branch-Id', IDS.canTho)
      .send({ effect: PermissionEffect.ALLOW })
      .expect(403);
  });

  it('searches branches server-side without escaping branch scope', async () => {
    const byCode = await request(app.getHttpServer())
      .get(`${API}/branches`)
      .query({ search: 'CAN-THO' })
      .set('Cookie', superAdminAuth.cookie)
      .expect(200);
    expect(byCode.body.data).toEqual([
      expect.objectContaining({ id: IDS.canTho, code: 'can-tho' }),
    ]);

    const byName = await request(app.getHttpServer())
      .get(`${API}/branches`)
      .query({ search: 'Cần' })
      .set('Cookie', superAdminAuth.cookie)
      .expect(200);
    expect(byName.body.data).toEqual([
      expect.objectContaining({ id: IDS.canTho }),
    ]);

    const paginated = await request(app.getHttpServer())
      .get(`${API}/branches`)
      .query({ search: 'in', limit: 1 })
      .set('Cookie', superAdminAuth.cookie)
      .expect(200);
    expect(paginated.body.data).toHaveLength(1);
    expect(paginated.body.meta).toEqual(
      expect.objectContaining({ total: 2, page: 1, limit: 1, lastPage: 2 }),
    );

    await request(app.getHttpServer())
      .get(`${API}/branches`)
      .query({ search: 'not-a-real-branch' })
      .set('Cookie', superAdminAuth.cookie)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toEqual([]);
        expect(body.meta.total).toBe(0);
      });

    await request(app.getHttpServer())
      .get(`${API}/branches`)
      .query({ search: 'can-tho' })
      .set('Cookie', adminHauGiangAuth.cookie)
      .set('X-Branch-Id', IDS.hauGiang)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toEqual([]);
        expect(body.meta.total).toBe(0);
      });
  });

  it('creates and updates two-level Branch coordinates without district', async () => {
    const created = await request(app.getHttpServer())
      .post(`${API}/branches`)
      .set('Cookie', withCsrf(superAdminAuth))
      .set('X-CSRF-Token', CSRF)
      .send({
        name: 'Coordinate Branch',
        code: 'coordinate-branch',
        address: 'Số 1, phường Ninh Kiều, Cần Thơ',
        province: 'Cần Thơ',
        ward: 'Ninh Kiều',
        latitude: 10.0452,
        longitude: 105.7469,
      })
      .expect(201);
    expect(created.body.data).toEqual(
      expect.objectContaining({
        province: 'Cần Thơ',
        ward: 'Ninh Kiều',
        latitude: 10.0452,
        longitude: 105.7469,
      }),
    );
    expect(created.body.data).not.toHaveProperty('district');

    const branchId = created.body.data.id as string;
    await request(app.getHttpServer())
      .patch(`${API}/branches/${branchId}`)
      .set('Cookie', withCsrf(superAdminAuth))
      .set('X-CSRF-Token', CSRF)
      .send({ latitude: -90, longitude: 180 })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toEqual(
          expect.objectContaining({ latitude: -90, longitude: 180 }),
        );
      });

    await request(app.getHttpServer())
      .patch(`${API}/branches/${branchId}`)
      .set('Cookie', withCsrf(superAdminAuth))
      .set('X-CSRF-Token', CSRF)
      .send({ district: 'Legacy district' })
      .expect(400);

    await request(app.getHttpServer())
      .delete(`${API}/branches/${branchId}`)
      .set('Cookie', withCsrf(superAdminAuth))
      .set('X-CSRF-Token', CSRF)
      .expect(200);
  });

  it('enforces staff visibility, selected-branch writes, headers, and no cross-admin overwrite', async () => {
    await request(app.getHttpServer())
      .get(`${API}/staff`)
      .set('Cookie', adminHauGiangAuth.cookie)
      .set('X-Branch-Id', IDS.hauGiang)
      .expect(200)
      .expect(({ body }) => {
        const staff = body.data.find(
          ({ id }: { id: string }) => id === IDS.staffMulti,
        );
        expect(staff.assignment.branchId).toBe(IDS.hauGiang);
        expect(staff.assignment.roles).toEqual([
          expect.objectContaining({ code: 'STAFF' }),
        ]);
        expect(staff.assignment.permissions).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              effect: PermissionEffect.ALLOW,
              permission: expect.objectContaining({
                code: 'inventory.update',
              }),
            }),
            expect.objectContaining({
              effect: PermissionEffect.DENY,
              permission: expect.objectContaining({
                code: 'payments.create',
              }),
            }),
          ]),
        );
      });

    await request(app.getHttpServer())
      .get(`${API}/staff/${IDS.staffMulti}`)
      .set('Cookie', adminHauGiangAuth.cookie)
      .set('X-Branch-Id', IDS.hauGiang)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.assignment.id).toBe(fixture.bHauGiangUserBranchId);
        expect(body.data.assignment.branchId).toBe(IDS.hauGiang);
        expect(body.data.assignment.roles[0].code).toBe('STAFF');
      });

    await request(app.getHttpServer())
      .get(`${API}/staff/${IDS.staffMulti}`)
      .set('Cookie', adminCanThoAuth.cookie)
      .set('X-Branch-Id', IDS.canTho)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.assignment.id).toBe(fixture.bCanThoUserBranchId);
        expect(body.data.assignment.branchId).toBe(IDS.canTho);
        expect(body.data.assignment.roles[0].code).toBe('CASHIER');
      });

    await request(app.getHttpServer())
      .get(`${API}/staff/${IDS.staffMulti}`)
      .set('Cookie', adminHauGiangAuth.cookie)
      .set('X-Branch-Id', IDS.canTho)
      .expect(403);

    await request(app.getHttpServer())
      .put(`${API}/staff/${IDS.staffMulti}/permissions/${IDS.inventoryUpdate}`)
      .set('Cookie', withCsrf(adminHauGiangAuth))
      .set('X-CSRF-Token', CSRF)
      .send({ effect: PermissionEffect.ALLOW })
      .expect(400);

    await request(app.getHttpServer())
      .put(`${API}/staff/${IDS.staffMulti}/permissions/${IDS.inventoryUpdate}`)
      .set('Cookie', withCsrf(adminHauGiangAuth))
      .set('X-CSRF-Token', CSRF)
      .set('X-Branch-Id', IDS.hauGiang)
      .send({ effect: PermissionEffect.ALLOW })
      .expect(200);

    await request(app.getHttpServer())
      .delete(
        `${API}/staff/${IDS.staffMulti}/permissions/${IDS.inventoryUpdate}`,
      )
      .set('Cookie', withCsrf(adminCanThoAuth))
      .set('X-CSRF-Token', CSRF)
      .set('X-Branch-Id', IDS.hauGiang)
      .expect(403);

    await request(app.getHttpServer())
      .put(`${API}/staff/${IDS.staffMulti}/permissions/${IDS.paymentsCreate}`)
      .set('Cookie', withCsrf(adminCanThoAuth))
      .set('X-CSRF-Token', CSRF)
      .set('X-Branch-Id', IDS.canTho)
      .send({ effect: PermissionEffect.ALLOW })
      .expect(200);

    const assignments = await prisma.userBranch.findMany({
      where: { userId: IDS.staffMulti },
      select: {
        id: true,
        branchId: true,
        permissions: {
          select: { permissionId: true, effect: true },
          orderBy: { permissionId: 'asc' },
        },
      },
      orderBy: { branchId: 'asc' },
    });
    expect(assignments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: fixture.bHauGiangUserBranchId,
          branchId: IDS.hauGiang,
          permissions: expect.arrayContaining([
            expect.objectContaining({
              permissionId: IDS.inventoryUpdate,
              effect: PermissionEffect.ALLOW,
            }),
          ]),
        }),
        expect.objectContaining({
          id: fixture.bCanThoUserBranchId,
          branchId: IDS.canTho,
          permissions: expect.arrayContaining([
            expect.objectContaining({
              permissionId: IDS.paymentsCreate,
              effect: PermissionEffect.ALLOW,
            }),
          ]),
        }),
      ]),
    );
  });

  it('keeps role mutations branch-local and enforces role type and strict level', async () => {
    await request(app.getHttpServer())
      .post(`${API}/staff/${IDS.staffMulti}/roles/${IDS.cashierRole}`)
      .set('Cookie', withCsrf(adminHauGiangAuth))
      .set('X-CSRF-Token', CSRF)
      .set('X-Branch-Id', IDS.hauGiang)
      .expect(201);

    const afterAssign = await prisma.userBranch.findMany({
      where: { userId: IDS.staffMulti },
      select: {
        id: true,
        branchId: true,
        roles: { select: { roleId: true } },
      },
    });
    expect(
      afterAssign.find(({ branchId }) => branchId === IDS.hauGiang),
    ).toEqual(
      expect.objectContaining({
        id: fixture.bHauGiangUserBranchId,
        roles: expect.arrayContaining([{ roleId: IDS.cashierRole }]),
      }),
    );
    expect(afterAssign.find(({ branchId }) => branchId === IDS.canTho)).toEqual(
      expect.objectContaining({
        id: fixture.bCanThoUserBranchId,
        roles: [{ roleId: IDS.cashierRole }],
      }),
    );

    await request(app.getHttpServer())
      .delete(`${API}/staff/${IDS.staffMulti}/roles/${IDS.cashierRole}`)
      .set('Cookie', withCsrf(adminHauGiangAuth))
      .set('X-CSRF-Token', CSRF)
      .set('X-Branch-Id', IDS.hauGiang)
      .expect(200);

    expect(
      await prisma.userBranchRole.findMany({
        where: { roleId: IDS.cashierRole },
        select: { userBranchId: true },
      }),
    ).toEqual([{ userBranchId: fixture.bCanThoUserBranchId }]);

    await request(app.getHttpServer())
      .post(`${API}/staff/${IDS.staffMulti}/roles/${IDS.cashierRole}`)
      .set('Cookie', withCsrf(adminHauGiangAuth))
      .set('X-CSRF-Token', CSRF)
      .set('X-Branch-Id', IDS.canTho)
      .expect(403);

    await request(app.getHttpServer())
      .post(`${API}/staff/${IDS.staffMulti}/roles/${IDS.staffRole}`)
      .set('Cookie', withCsrf(adminCanThoAuth))
      .set('X-CSRF-Token', CSRF)
      .set('X-Branch-Id', IDS.hauGiang)
      .expect(403);

    await request(app.getHttpServer())
      .post(`${API}/staff/${IDS.staffMulti}/roles/${IDS.branchAdminRole}`)
      .set('Cookie', withCsrf(adminHauGiangAuth))
      .set('X-CSRF-Token', CSRF)
      .set('X-Branch-Id', IDS.hauGiang)
      .expect(403);

    await request(app.getHttpServer())
      .post(`${API}/staff/${IDS.staffMulti}/roles/${IDS.superAdminRole}`)
      .set('Cookie', withCsrf(adminHauGiangAuth))
      .set('X-CSRF-Token', CSRF)
      .set('X-Branch-Id', IDS.hauGiang)
      .expect(400);

    await request(app.getHttpServer())
      .post(`${API}/staff/${IDS.staffMulti}/roles/${IDS.peerRole}`)
      .set('Cookie', withCsrf(adminHauGiangAuth))
      .set('X-CSRF-Token', CSRF)
      .set('X-Branch-Id', IDS.hauGiang)
      .expect(403);
  });

  it('preserves one qualifying staff role under concurrent removals', async () => {
    const assignment = await prisma.userBranch.findFirstOrThrow({
      where: {
        userId: IDS.staffLastBranch,
        branchId: IDS.hauGiang,
      },
      select: { id: true },
    });
    await prisma.userBranchRole.create({
      data: {
        userBranchId: assignment.id,
        roleId: IDS.cashierRole,
      },
    });

    const responses = await Promise.all([
      request(app.getHttpServer())
        .delete(`${API}/staff/${IDS.staffLastBranch}/roles/${IDS.staffRole}`)
        .set('Cookie', withCsrf(adminHauGiangAuth))
        .set('X-CSRF-Token', CSRF)
        .set('X-Branch-Id', IDS.hauGiang),
      request(app.getHttpServer())
        .delete(`${API}/staff/${IDS.staffLastBranch}/roles/${IDS.cashierRole}`)
        .set('Cookie', withCsrf(adminHauGiangAuth))
        .set('X-CSRF-Token', CSRF)
        .set('X-Branch-Id', IDS.hauGiang),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    const conflict = responses.find(({ status }) => status === 409);
    expect(conflict?.body.code).toBe('STAFF_LAST_ROLE_REQUIRED');
    await expect(
      prisma.userBranchRole.count({
        where: { userBranchId: assignment.id },
      }),
    ).resolves.toBe(1);
  });

  it('keeps direct permission writes branch-local and applies delegation symmetrically', async () => {
    await request(app.getHttpServer())
      .delete(
        `${API}/staff/${IDS.staffMulti}/permissions/${IDS.inventoryUpdate}`,
      )
      .set('Cookie', withCsrf(adminHauGiangAuth))
      .set('X-CSRF-Token', CSRF)
      .set('X-Branch-Id', IDS.hauGiang)
      .expect(200);

    expect(
      await prisma.userBranchPermission.findMany({
        where: {
          permissionId: IDS.inventoryUpdate,
          userBranch: { userId: IDS.staffMulti },
        },
        select: { userBranchId: true, effect: true },
      }),
    ).toEqual([
      {
        userBranchId: fixture.bCanThoUserBranchId,
        effect: PermissionEffect.DENY,
      },
    ]);

    await request(app.getHttpServer())
      .put(`${API}/staff/${IDS.staffMulti}/permissions/${IDS.inventoryUpdate}`)
      .set('Cookie', withCsrf(adminHauGiangAuth))
      .set('X-CSRF-Token', CSRF)
      .set('X-Branch-Id', IDS.hauGiang)
      .send({ effect: PermissionEffect.ALLOW })
      .expect(200);

    await request(app.getHttpServer())
      .put(
        `${API}/staff/${IDS.staffMulti}/permissions/${IDS.staffAssignBranch}`,
      )
      .set('Cookie', withCsrf(adminHauGiangAuth))
      .set('X-CSRF-Token', CSRF)
      .set('X-Branch-Id', IDS.hauGiang)
      .send({ effect: PermissionEffect.ALLOW })
      .expect(403);

    await request(app.getHttpServer())
      .put(`${API}/staff/${IDS.staffMulti}/permissions/${IDS.paymentsCreate}`)
      .set('Cookie', withCsrf(adminHauGiangAuth))
      .set('X-CSRF-Token', CSRF)
      .set('X-Branch-Id', IDS.hauGiang)
      .send({ effect: PermissionEffect.ALLOW })
      .expect(403);

    await request(app.getHttpServer())
      .delete(
        `${API}/staff/${IDS.staffMulti}/permissions/${IDS.paymentsCreate}`,
      )
      .set('Cookie', withCsrf(adminHauGiangAuth))
      .set('X-CSRF-Token', CSRF)
      .set('X-Branch-Id', IDS.hauGiang)
      .expect(403);

    await request(app.getHttpServer())
      .delete(
        `${API}/staff/${IDS.staffMulti}/permissions/${IDS.inventoryUpdate}`,
      )
      .set('Cookie', withCsrf(adminCanThoAuth))
      .set('X-CSRF-Token', CSRF)
      .set('X-Branch-Id', IDS.hauGiang)
      .expect(403);
  });

  it('transfers Staff between branches atomically without revoking sessions', async () => {
    const transferAuth = await createAuth(
      prisma,
      jwtService,
      IDS.transferNewDestination,
    );

    await request(app.getHttpServer())
      .post(`${API}/staff/${IDS.transferNewDestination}/transfer-branch`)
      .set('Cookie', withCsrf(adminHauGiangAuth))
      .set('X-CSRF-Token', CSRF)
      .send({
        fromBranchId: IDS.hauGiang,
        toBranchId: IDS.vinhLong,
        destinationRoleIds: [IDS.staffRole],
      })
      .expect(403);

    await request(app.getHttpServer())
      .post(`${API}/staff/${IDS.transferNewDestination}/transfer-branch`)
      .set('Cookie', superAdminAuth.cookie)
      .send({
        fromBranchId: IDS.hauGiang,
        toBranchId: IDS.vinhLong,
        destinationRoleIds: [IDS.staffRole],
      })
      .expect(403);

    await request(app.getHttpServer())
      .post(`${API}/staff/${IDS.transferNewDestination}/transfer-branch`)
      .set('Cookie', withCsrf(superAdminAuth))
      .set('X-CSRF-Token', CSRF)
      .send({
        fromBranchId: IDS.hauGiang,
        toBranchId: IDS.hauGiang,
        destinationRoleIds: [IDS.staffRole],
      })
      .expect(400);

    await request(app.getHttpServer())
      .post(`${API}/staff/${IDS.staffMulti}/transfer-branch`)
      .set('Cookie', withCsrf(superAdminAuth))
      .set('X-CSRF-Token', CSRF)
      .send({
        fromBranchId: IDS.hauGiang,
        toBranchId: IDS.canTho,
        destinationRoleIds: [IDS.staffRole],
      })
      .expect(409);

    await request(app.getHttpServer())
      .post(`${API}/staff/${IDS.transferNewDestination}/transfer-branch`)
      .set('Cookie', withCsrf(superAdminAuth))
      .set('X-CSRF-Token', CSRF)
      .send({
        fromBranchId: IDS.hauGiang,
        toBranchId: IDS.inactiveBranch,
        destinationRoleIds: [IDS.staffRole],
      })
      .expect(400);

    await request(app.getHttpServer())
      .post(`${API}/staff/${IDS.transferNewDestination}/transfer-branch`)
      .set('Cookie', withCsrf(superAdminAuth))
      .set('X-CSRF-Token', CSRF)
      .send({
        fromBranchId: IDS.hauGiang,
        toBranchId: IDS.vinhLong,
        destinationRoleIds: [IDS.branchAdminRole],
      })
      .expect(400);

    await request(app.getHttpServer())
      .post(`${API}/staff/${IDS.transferNewDestination}/transfer-branch`)
      .set('Cookie', withCsrf(superAdminAuth))
      .set('X-CSRF-Token', CSRF)
      .send({
        fromBranchId: IDS.hauGiang,
        toBranchId: IDS.vinhLong,
        destinationRoleIds: [IDS.staffRole],
      })
      .expect(201);

    const transferred = await prisma.user.findUniqueOrThrow({
      where: { id: IDS.transferNewDestination },
      select: {
        isActive: true,
        authSessions: { select: { revokedAt: true } },
        userBranches: {
          select: {
            branchId: true,
            isActive: true,
            isPrimary: true,
            roles: { select: { roleId: true } },
            permissions: { select: { permissionId: true } },
          },
          orderBy: { branchId: 'asc' },
        },
      },
    });
    expect(transferred.isActive).toBe(true);
    expect(transferred.authSessions).toEqual([{ revokedAt: null }]);
    expect(transferred.userBranches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          branchId: IDS.hauGiang,
          isActive: false,
          isPrimary: false,
        }),
        expect.objectContaining({
          branchId: IDS.vinhLong,
          isActive: true,
          isPrimary: true,
          roles: [{ roleId: IDS.staffRole }],
          permissions: [],
        }),
      ]),
    );

    await request(app.getHttpServer())
      .get(`${API}/auth/me`)
      .set('Cookie', transferAuth.cookie)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.branchAssignments).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              branchId: IDS.vinhLong,
              roles: expect.arrayContaining([
                expect.objectContaining({ code: 'STAFF' }),
              ]),
            }),
          ]),
        );
        expect(
          body.data.branchAssignments.some(
            ({ branchId }: { branchId: string }) => branchId === IDS.hauGiang,
          ),
        ).toBe(false);
      });

    await request(app.getHttpServer())
      .post(`${API}/staff/${IDS.transferInactiveDestination}/transfer-branch`)
      .set('Cookie', withCsrf(superAdminAuth))
      .set('X-CSRF-Token', CSRF)
      .send({
        fromBranchId: IDS.hauGiang,
        toBranchId: IDS.vinhLong,
        destinationRoleIds: [IDS.cashierRole],
      })
      .expect(201);

    const reactivated = await prisma.userBranch.findUniqueOrThrow({
      where: {
        userId_branchId: {
          userId: IDS.transferInactiveDestination,
          branchId: IDS.vinhLong,
        },
      },
      select: {
        isActive: true,
        isPrimary: true,
        roles: { select: { roleId: true } },
        permissions: { select: { permissionId: true } },
      },
    });
    expect(reactivated).toEqual({
      isActive: true,
      isPrimary: true,
      roles: [{ roleId: IDS.cashierRole }],
      permissions: [],
    });

    await request(app.getHttpServer())
      .post(`${API}/staff/${IDS.transferNonPrimary}/transfer-branch`)
      .set('Cookie', withCsrf(superAdminAuth))
      .set('X-CSRF-Token', CSRF)
      .send({
        fromBranchId: IDS.canTho,
        toBranchId: IDS.vinhLong,
        destinationRoleIds: [IDS.staffRole],
      })
      .expect(201);

    const nonPrimaryBranches = await prisma.userBranch.findMany({
      where: { userId: IDS.transferNonPrimary },
      select: { branchId: true, isActive: true, isPrimary: true },
      orderBy: { branchId: 'asc' },
    });
    expect(nonPrimaryBranches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          branchId: IDS.hauGiang,
          isActive: true,
          isPrimary: true,
        }),
        expect.objectContaining({
          branchId: IDS.canTho,
          isActive: false,
          isPrimary: false,
        }),
        expect.objectContaining({
          branchId: IDS.vinhLong,
          isActive: true,
          isPrimary: false,
        }),
      ]),
    );
  });

  it('allows Super Admin transfer without X-Branch-Id because body defines source and destination', async () => {
    await request(app.getHttpServer())
      .post(`${API}/staff/${IDS.transferNoHeader}/transfer-branch`)
      .set('Cookie', withCsrf(superAdminAuth))
      .set('X-CSRF-Token', CSRF)
      .send({
        fromBranchId: IDS.hauGiang,
        toBranchId: IDS.vinhLong,
        destinationRoleIds: [IDS.staffRole],
      })
      .expect(201);

    const assignments = await prisma.userBranch.findMany({
      where: { userId: IDS.transferNoHeader },
      select: { branchId: true, isActive: true, isPrimary: true },
      orderBy: { branchId: 'asc' },
    });
    expect(assignments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          branchId: IDS.hauGiang,
          isActive: false,
          isPrimary: false,
        }),
        expect.objectContaining({
          branchId: IDS.vinhLong,
          isActive: true,
          isPrimary: true,
        }),
      ]),
    );
  });

  it('rolls back when transfer fails after destination writes have started', async () => {
    await request(app.getHttpServer())
      .post(`${API}/staff/${IDS.transferRollbackAfterWrite}/transfer-branch`)
      .set('Cookie', withCsrf(superAdminAuth))
      .set('X-CSRF-Token', CSRF)
      .send({
        fromBranchId: IDS.hauGiang,
        toBranchId: IDS.vinhLong,
        destinationRoleIds: [IDS.staffRole],
      })
      .expect(400);

    const assignments = await prisma.userBranch.findMany({
      where: { userId: IDS.transferRollbackAfterWrite },
      select: {
        branchId: true,
        isActive: true,
        isPrimary: true,
        roles: { select: { roleId: true } },
      },
      orderBy: { branchId: 'asc' },
    });
    expect(assignments).toEqual([
      {
        branchId: IDS.hauGiang,
        isActive: true,
        isPrimary: false,
        roles: [{ roleId: IDS.staffRole }],
      },
    ]);
  });

  it('handles concurrent transfer without duplicate destination assignment or multiple active primaries', async () => {
    const responses = await Promise.all([
      request(app.getHttpServer())
        .post(`${API}/staff/${IDS.transferConcurrent}/transfer-branch`)
        .set('Cookie', withCsrf(superAdminAuth))
        .set('X-CSRF-Token', CSRF)
        .send({
          fromBranchId: IDS.hauGiang,
          toBranchId: IDS.vinhLong,
          destinationRoleIds: [IDS.staffRole],
        }),
      request(app.getHttpServer())
        .post(`${API}/staff/${IDS.transferConcurrent}/transfer-branch`)
        .set('Cookie', withCsrf(superAdminAuth))
        .set('X-CSRF-Token', CSRF)
        .send({
          fromBranchId: IDS.hauGiang,
          toBranchId: IDS.vinhLong,
          destinationRoleIds: [IDS.staffRole],
        }),
    ]);
    const statuses = responses.map(({ status }) => status);
    expect(statuses.filter((status) => status === 201)).toHaveLength(1);
    expect(
      statuses.filter((status) => [404, 409].includes(status)),
    ).toHaveLength(1);

    const assignments = await prisma.userBranch.findMany({
      where: { userId: IDS.transferConcurrent },
      select: { branchId: true, isActive: true, isPrimary: true },
      orderBy: { branchId: 'asc' },
    });
    expect(
      assignments.filter(({ branchId }) => branchId === IDS.vinhLong),
    ).toHaveLength(1);
    expect(
      assignments.filter(({ isActive, isPrimary }) => isActive && isPrimary),
    ).toHaveLength(1);
    expect(assignments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          branchId: IDS.hauGiang,
          isActive: false,
          isPrimary: false,
        }),
        expect.objectContaining({
          branchId: IDS.vinhLong,
          isActive: true,
          isPrimary: true,
        }),
      ]),
    );
  });

  it('blocks branch deactivation while active branch assignments remain', async () => {
    await request(app.getHttpServer())
      .delete(`${API}/branches/${IDS.canTho}`)
      .set('Cookie', withCsrf(superAdminAuth))
      .set('X-CSRF-Token', CSRF)
      .expect(409);

    await expect(
      prisma.branch.findUniqueOrThrow({
        where: { id: IDS.canTho },
        select: { isActive: true },
      }),
    ).resolves.toEqual({ isActive: true });
  });

  it('offboards only the selected branch and handles last-branch deactivation atomically', async () => {
    await request(app.getHttpServer())
      .delete(`${API}/staff/${IDS.staffMulti}`)
      .set('Cookie', withCsrf(adminHauGiangAuth))
      .set('X-CSRF-Token', CSRF)
      .set('X-Branch-Id', IDS.hauGiang)
      .expect(200);

    const staffBranches = await prisma.userBranch.findMany({
      where: { userId: IDS.staffMulti },
      select: {
        id: true,
        branchId: true,
        isActive: true,
        isPrimary: true,
        user: { select: { isActive: true } },
        roles: { select: { role: { select: { code: true } } } },
        permissions: { select: { permission: { select: { code: true } } } },
      },
      orderBy: { branchId: 'asc' },
    });
    expect(staffBranches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          branchId: IDS.hauGiang,
          isActive: false,
          isPrimary: false,
          user: { isActive: true },
        }),
        expect.objectContaining({
          branchId: IDS.canTho,
          isActive: true,
          isPrimary: true,
          user: { isActive: true },
          roles: [
            expect.objectContaining({
              role: expect.objectContaining({ code: 'CASHIER' }),
            }),
          ],
          permissions: expect.arrayContaining([
            expect.objectContaining({
              permission: expect.objectContaining({ code: 'payments.create' }),
            }),
          ]),
        }),
      ]),
    );

    await request(app.getHttpServer())
      .get(`${API}/probe/inventory`)
      .set('Cookie', staffAuth.cookie)
      .set('X-Branch-Id', IDS.hauGiang)
      .expect(403);

    await request(app.getHttpServer())
      .get(`${API}/probe/payments`)
      .set('Cookie', staffAuth.cookie)
      .set('X-Branch-Id', IDS.canTho)
      .expect(200);

    await request(app.getHttpServer())
      .get(`${API}/staff/${IDS.staffMulti}`)
      .set('Cookie', adminCanThoAuth.cookie)
      .set('X-Branch-Id', IDS.canTho)
      .expect(200);

    await request(app.getHttpServer())
      .delete(`${API}/users/${IDS.staffMulti}`)
      .set('Cookie', withCsrf(adminHauGiangAuth))
      .set('X-CSRF-Token', CSRF)
      .expect(403);

    await request(app.getHttpServer())
      .delete(`${API}/staff/${IDS.staffMulti}`)
      .set('Cookie', withCsrf(adminHauGiangAuth))
      .set('X-CSRF-Token', CSRF)
      .set('X-Branch-Id', IDS.canTho)
      .expect(403);

    const lastBranchAuth = await createAuth(
      prisma,
      jwtService,
      IDS.staffLastBranch,
    );
    await request(app.getHttpServer())
      .delete(`${API}/staff/${IDS.staffLastBranch}`)
      .set('Cookie', withCsrf(adminHauGiangAuth))
      .set('X-CSRF-Token', CSRF)
      .set('X-Branch-Id', IDS.hauGiang)
      .expect(200);
    const lastBranchUser = await prisma.user.findUniqueOrThrow({
      where: { id: IDS.staffLastBranch },
      select: { isActive: true, authSessions: { select: { revokedAt: true } } },
    });
    expect(lastBranchUser.isActive).toBe(false);
    expect(lastBranchUser.authSessions).toEqual([
      expect.objectContaining({ revokedAt: expect.any(Date) }),
    ]);

    await request(app.getHttpServer())
      .get(`${API}/auth/me`)
      .set('Cookie', lastBranchAuth.cookie)
      .expect(401);
  });

  it('keeps staff branch assignment Super Admin-only and preserves default Branch Admin permissions', async () => {
    const defaultBranchAdminPermissions = await prisma.rolePermission.findMany({
      where: { roleId: IDS.branchAdminRole },
      select: { permission: { select: { code: true } } },
    });
    const defaultPermissionCodes = defaultBranchAdminPermissions.map(
      ({ permission }) => permission.code,
    );
    expect(defaultPermissionCodes).toContain('staff.delete');
    expect(defaultPermissionCodes).not.toContain('staff.assign_branch');

    await request(app.getHttpServer())
      .post(`${API}/staff/${IDS.staffMulti}/branches/${IDS.vinhLong}`)
      .set('Cookie', withCsrf(adminHauGiangAuth))
      .set('X-CSRF-Token', CSRF)
      .set('X-Branch-Id', IDS.hauGiang)
      .expect(403);

    await request(app.getHttpServer())
      .patch(`${API}/staff/${IDS.staffMulti}/branches/${IDS.canTho}/deactivate`)
      .set('Cookie', withCsrf(adminHauGiangAuth))
      .set('X-CSRF-Token', CSRF)
      .set('X-Branch-Id', IDS.hauGiang)
      .send({ replacementBranchId: IDS.hauGiang })
      .expect(403);

    await request(app.getHttpServer())
      .patch(`${API}/staff/${IDS.staffMulti}/branches/${IDS.hauGiang}/activate`)
      .set('Cookie', withCsrf(adminHauGiangAuth))
      .set('X-CSRF-Token', CSRF)
      .set('X-Branch-Id', IDS.hauGiang)
      .expect(403);

    await request(app.getHttpServer())
      .patch(`${API}/staff/${IDS.staffMulti}/branches/${IDS.canTho}/primary`)
      .set('Cookie', withCsrf(adminHauGiangAuth))
      .set('X-CSRF-Token', CSRF)
      .set('X-Branch-Id', IDS.hauGiang)
      .expect(403);

    await request(app.getHttpServer())
      .delete(`${API}/staff/${IDS.staffMulti}/branches/${IDS.hauGiang}`)
      .set('Cookie', withCsrf(adminHauGiangAuth))
      .set('X-CSRF-Token', CSRF)
      .set('X-Branch-Id', IDS.hauGiang)
      .send({})
      .expect(403);

    await request(app.getHttpServer())
      .post(`${API}/staff/${IDS.staffMulti}/branches/${IDS.vinhLong}`)
      .set('Cookie', withCsrf(superAdminAuth))
      .set('X-CSRF-Token', CSRF)
      .expect(201);

    const vinhLongAssignment = await prisma.userBranch.findUniqueOrThrow({
      where: {
        userId_branchId: {
          userId: IDS.staffMulti,
          branchId: IDS.vinhLong,
        },
      },
      select: {
        id: true,
        isActive: true,
        roles: { select: { role: { select: { code: true } } } },
      },
    });
    expect(vinhLongAssignment).toEqual(
      expect.objectContaining({
        isActive: true,
        roles: [{ role: { code: 'STAFF' } }],
      }),
    );

    await request(app.getHttpServer())
      .patch(`${API}/staff/${IDS.staffMulti}/branches/${IDS.vinhLong}/primary`)
      .set('Cookie', withCsrf(superAdminAuth))
      .set('X-CSRF-Token', CSRF)
      .expect(200);

    await request(app.getHttpServer())
      .patch(
        `${API}/staff/${IDS.staffMulti}/branches/${IDS.vinhLong}/deactivate`,
      )
      .set('Cookie', withCsrf(superAdminAuth))
      .set('X-CSRF-Token', CSRF)
      .send({ replacementBranchId: IDS.canTho })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`${API}/staff/${IDS.staffMulti}/branches/${IDS.vinhLong}/activate`)
      .set('Cookie', withCsrf(superAdminAuth))
      .set('X-CSRF-Token', CSRF)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`${API}/staff/${IDS.staffMulti}/branches/${IDS.canTho}/primary`)
      .set('Cookie', withCsrf(superAdminAuth))
      .set('X-CSRF-Token', CSRF)
      .expect(200);

    await request(app.getHttpServer())
      .delete(`${API}/staff/${IDS.staffMulti}/branches/${IDS.vinhLong}`)
      .set('Cookie', withCsrf(superAdminAuth))
      .set('X-CSRF-Token', CSRF)
      .send({})
      .expect(200);

    expect(
      await prisma.userBranch.findUnique({
        where: {
          userId_branchId: {
            userId: IDS.staffMulti,
            branchId: IDS.vinhLong,
          },
        },
      }),
    ).toBeNull();

    await request(app.getHttpServer())
      .post(`${API}/staff/${IDS.staffLastBranch}/branches/${IDS.canTho}`)
      .set('Cookie', withCsrf(superAdminAuth))
      .set('X-CSRF-Token', CSRF)
      .expect(201);
    const stillDisabled = await prisma.user.findUniqueOrThrow({
      where: { id: IDS.staffLastBranch },
      select: {
        isActive: true,
        userBranches: {
          where: { branchId: IDS.canTho },
          select: { isActive: true, roles: { select: { roleId: true } } },
        },
      },
    });
    expect(stillDisabled).toEqual({
      isActive: false,
      userBranches: [
        {
          isActive: true,
          roles: [{ roleId: IDS.staffRole }],
        },
      ],
    });
  });

  it('converts a Customer to multi-branch Staff atomically through the API and keeps generic users.type blocked', async () => {
    await request(app.getHttpServer())
      .post(`${API}/staff/${IDS.customer}/convert`)
      .set('Cookie', withCsrf(superAdminAuth))
      .set('X-CSRF-Token', CSRF)
      .send({
        branchAssignments: [
          {
            branchId: IDS.hauGiang,
            isPrimary: true,
            roleIds: [IDS.staffRole],
            permissions: [
              {
                permissionId: IDS.inventoryUpdate,
                effect: PermissionEffect.ALLOW,
              },
            ],
          },
          {
            branchId: IDS.canTho,
            isPrimary: false,
            roleIds: [IDS.cashierRole],
            permissions: [
              {
                permissionId: IDS.paymentsCreate,
                effect: PermissionEffect.ALLOW,
              },
            ],
          },
        ],
      })
      .expect(201);

    const converted = await prisma.user.findUniqueOrThrow({
      where: { id: IDS.customer },
      select: {
        type: true,
        userRoles: true,
        userPermissions: true,
        orders: { select: { id: true } },
        userBranches: {
          select: {
            branchId: true,
            isPrimary: true,
            roles: { select: { roleId: true } },
            permissions: {
              select: { permissionId: true, effect: true },
            },
          },
          orderBy: { branchId: 'asc' },
        },
      },
    });
    expect(converted.type).toBe(UserType.BRANCH);
    expect(converted.userRoles).toEqual([]);
    expect(converted.userPermissions).toEqual([]);
    expect(converted.orders).toEqual([{ id: IDS.order }]);
    expect(converted.userBranches).toHaveLength(2);
    expect(
      converted.userBranches.filter(({ isPrimary }) => isPrimary),
    ).toHaveLength(1);
    expect(converted.userBranches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          branchId: IDS.hauGiang,
          roles: [{ roleId: IDS.staffRole }],
          permissions: [
            {
              permissionId: IDS.inventoryUpdate,
              effect: PermissionEffect.ALLOW,
            },
          ],
        }),
        expect.objectContaining({
          branchId: IDS.canTho,
          roles: [{ roleId: IDS.cashierRole }],
          permissions: [
            {
              permissionId: IDS.paymentsCreate,
              effect: PermissionEffect.ALLOW,
            },
          ],
        }),
      ]),
    );

    const convertedAuth = await createAuth(prisma, jwtService, IDS.customer);
    await request(app.getHttpServer())
      .get(`${API}/auth/me`)
      .set('Cookie', convertedAuth.cookie)
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.globalRoles).toEqual([]);
        expect(body.data.globalPermissions).toEqual([]);
        expect(body.data.branchAssignments).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              branchId: IDS.hauGiang,
              roles: expect.arrayContaining([
                expect.objectContaining({ code: 'STAFF' }),
              ]),
              permissions: expect.arrayContaining(['inventory.update']),
            }),
            expect.objectContaining({
              branchId: IDS.canTho,
              roles: expect.arrayContaining([
                expect.objectContaining({ code: 'CASHIER' }),
              ]),
              permissions: expect.arrayContaining(['payments.create']),
            }),
          ]),
        );
      });

    await request(app.getHttpServer())
      .patch(`${API}/users/${IDS.customer}`)
      .set('Cookie', withCsrf(superAdminAuth))
      .set('X-CSRF-Token', CSRF)
      .send({ type: UserType.SYSTEM })
      .expect(400);
  });

  it('rejects invalid Customer conversions and leaves the Customer authorization state intact', async () => {
    const validAssignment = {
      branchId: IDS.hauGiang,
      isPrimary: true,
      roleIds: [IDS.staffRole],
      permissions: [
        {
          permissionId: IDS.inventoryUpdate,
          effect: PermissionEffect.ALLOW,
        },
      ],
    };

    await request(app.getHttpServer())
      .post(`${API}/staff/${IDS.staffMulti}/convert`)
      .set('Cookie', withCsrf(superAdminAuth))
      .set('X-CSRF-Token', CSRF)
      .send({ branchAssignments: [validAssignment] })
      .expect(400);

    await request(app.getHttpServer())
      .post(`${API}/staff/${IDS.rollbackCustomer}/convert`)
      .set('Cookie', withCsrf(superAdminAuth))
      .set('X-CSRF-Token', CSRF)
      .send({
        branchAssignments: [
          {
            ...validAssignment,
            branchId: IDS.inactiveBranch,
          },
        ],
      })
      .expect(400);

    await request(app.getHttpServer())
      .post(`${API}/staff/${IDS.rollbackCustomer}/convert`)
      .set('Cookie', withCsrf(superAdminAuth))
      .set('X-CSRF-Token', CSRF)
      .send({
        branchAssignments: [
          {
            ...validAssignment,
            roleIds: [IDS.superAdminRole],
          },
        ],
      })
      .expect(400);

    await request(app.getHttpServer())
      .post(`${API}/staff/${IDS.rollbackCustomer}/convert`)
      .set('Cookie', withCsrf(superAdminAuth))
      .set('X-CSRF-Token', CSRF)
      .send({
        branchAssignments: [validAssignment, validAssignment],
      })
      .expect(400);

    await request(app.getHttpServer())
      .post(`${API}/staff/${IDS.rollbackCustomer}/convert`)
      .set('Cookie', withCsrf(superAdminAuth))
      .set('X-CSRF-Token', CSRF)
      .send({
        branchAssignments: [
          {
            ...validAssignment,
            roleIds: [IDS.staffRole, IDS.staffRole],
          },
        ],
      })
      .expect(400);

    await request(app.getHttpServer())
      .post(`${API}/staff/${IDS.rollbackCustomer}/convert`)
      .set('Cookie', withCsrf(superAdminAuth))
      .set('X-CSRF-Token', CSRF)
      .send({
        branchAssignments: [
          {
            ...validAssignment,
            permissions: [
              ...validAssignment.permissions,
              ...validAssignment.permissions,
            ],
          },
        ],
      })
      .expect(400);

    const rollbackState = await prisma.user.findUniqueOrThrow({
      where: { id: IDS.rollbackCustomer },
      select: {
        type: true,
        userRoles: { select: { roleId: true } },
        userPermissions: {
          select: { permissionId: true, effect: true },
        },
        userBranches: true,
      },
    });
    expect(rollbackState).toEqual({
      type: UserType.CUSTOMER,
      userRoles: [{ roleId: IDS.customerRole }],
      userPermissions: [
        {
          permissionId: IDS.legacyUsersDelete,
          effect: PermissionEffect.ALLOW,
        },
      ],
      userBranches: [],
    });
  });
});

async function seedCrossBranchFixture(prisma: PrismaService): Promise<Fixture> {
  await prisma.branch.createMany({
    data: [
      {
        id: IDS.hauGiang,
        name: 'Hậu Giang',
        code: 'hau-giang',
        address: 'Hậu Giang',
      },
      {
        id: IDS.canTho,
        name: 'Cần Thơ',
        code: 'can-tho',
        address: 'Cần Thơ',
      },
      {
        id: IDS.vinhLong,
        name: 'Vĩnh Long',
        code: 'vinh-long',
        address: 'Vĩnh Long',
      },
      {
        id: IDS.inactiveBranch,
        name: 'Inactive',
        code: 'inactive',
        address: 'Inactive',
        isActive: false,
      },
    ],
  });

  await prisma.permission.createMany({
    data: [
      permission(IDS.staffRead, 'staff.read', 'staff', 'read'),
      permission(IDS.staffUpdate, 'staff.update', 'staff', 'update'),
      permission(IDS.staffDelete, 'staff.delete', 'staff', 'delete'),
      permission(
        IDS.staffAssignRole,
        'staff.assign_role',
        'staff',
        'assign_role',
      ),
      permission(
        IDS.staffAssignPermission,
        'staff.assign_permission',
        'staff',
        'assign_permission',
      ),
      permission(
        IDS.staffAssignBranch,
        'staff.assign_branch',
        'staff',
        'assign_branch',
      ),
      permission(IDS.branchesAssign, 'branches.assign', 'branches', 'assign'),
      permission(IDS.branchesRead, 'branches.read', 'branches', 'read'),
      permission(IDS.staffCreate, 'staff.create', 'staff', 'create'),
      permission(IDS.usersUpdate, 'users.update', 'users', 'update'),
      permission(IDS.usersDelete, 'users.delete', 'users', 'delete'),
      permission(
        IDS.inventoryUpdate,
        'inventory.update',
        'inventory',
        'update',
      ),
      permission(IDS.paymentsCreate, 'payments.create', 'payments', 'create'),
      permission(IDS.legacyUsersDelete, 'legacy.delete', 'legacy', 'delete'),
    ],
  });

  await prisma.role.createMany({
    data: [
      {
        id: IDS.staffRole,
        code: 'STAFF',
        name: 'Staff',
        type: UserType.BRANCH,
        level: 10,
        isSystem: true,
      },
      {
        id: IDS.cashierRole,
        code: 'CASHIER',
        name: 'Cashier',
        type: UserType.BRANCH,
        level: 5,
        isSystem: true,
      },
      {
        id: IDS.peerRole,
        code: 'PEER_MANAGER',
        name: 'Peer manager',
        type: UserType.BRANCH,
        level: 70,
        isSystem: false,
      },
    ],
  });

  await prisma.rolePermission.createMany({
    data: [
      ...[
        IDS.staffRead,
        IDS.staffUpdate,
        IDS.staffDelete,
        IDS.staffAssignRole,
        IDS.staffAssignPermission,
        IDS.staffCreate,
      ].map((permissionId) => ({
        roleId: IDS.branchAdminRole,
        permissionId,
      })),
      {
        roleId: IDS.staffRole,
        permissionId: IDS.paymentsCreate,
      },
      {
        roleId: IDS.staffRole,
        permissionId: IDS.staffRead,
      },
      {
        roleId: IDS.cashierRole,
        permissionId: IDS.inventoryUpdate,
      },
    ],
  });

  await prisma.user.createMany({
    data: [
      user(IDS.superAdmin, 'super@example.test', UserType.SYSTEM),
      user(IDS.adminHauGiang, 'a.hg@example.test', UserType.BRANCH),
      user(IDS.adminCanTho, 'c.ct@example.test', UserType.BRANCH),
      user(IDS.staffMulti, 'b.multi@example.test', UserType.BRANCH),
      user(IDS.staffLastBranch, 'b.last@example.test', UserType.BRANCH),
      user(
        IDS.transferNewDestination,
        'transfer.new@example.test',
        UserType.BRANCH,
      ),
      user(
        IDS.transferInactiveDestination,
        'transfer.inactive@example.test',
        UserType.BRANCH,
      ),
      user(
        IDS.transferNonPrimary,
        'transfer.nonprimary@example.test',
        UserType.BRANCH,
      ),
      user(
        IDS.transferRollbackAfterWrite,
        'transfer.rollback@example.test',
        UserType.BRANCH,
      ),
      user(
        IDS.transferConcurrent,
        'transfer.concurrent@example.test',
        UserType.BRANCH,
      ),
      user(
        IDS.transferNoHeader,
        'transfer.noheader@example.test',
        UserType.BRANCH,
      ),
      user(IDS.staffCandidate, 'staff.candidate@example.test', UserType.BRANCH),
      user(IDS.customer, 'customer@example.test', UserType.CUSTOMER),
      user(
        IDS.rollbackCustomer,
        'rollback.customer@example.test',
        UserType.CUSTOMER,
      ),
    ],
  });

  await prisma.userRole.createMany({
    data: [
      { userId: IDS.superAdmin, roleId: IDS.superAdminRole },
      { userId: IDS.customer, roleId: IDS.customerRole },
      { userId: IDS.rollbackCustomer, roleId: IDS.customerRole },
      { userId: IDS.staffMulti, roleId: IDS.superAdminRole },
    ],
  });
  await prisma.userPermission.createMany({
    data: [
      {
        userId: IDS.customer,
        permissionId: IDS.legacyUsersDelete,
        effect: PermissionEffect.ALLOW,
      },
      {
        userId: IDS.rollbackCustomer,
        permissionId: IDS.legacyUsersDelete,
        effect: PermissionEffect.ALLOW,
      },
      {
        userId: IDS.staffMulti,
        permissionId: IDS.legacyUsersDelete,
        effect: PermissionEffect.ALLOW,
      },
    ],
  });

  const [aHauGiang, cCanTho, bHauGiang, bCanTho, bLast] =
    await prisma.$transaction([
      prisma.userBranch.create({
        data: {
          userId: IDS.adminHauGiang,
          branchId: IDS.hauGiang,
          isPrimary: true,
          roles: { create: { roleId: IDS.branchAdminRole } },
          permissions: {
            createMany: {
              data: [
                {
                  permissionId: IDS.inventoryUpdate,
                  effect: PermissionEffect.ALLOW,
                },
                {
                  permissionId: IDS.staffAssignBranch,
                  effect: PermissionEffect.ALLOW,
                },
                {
                  permissionId: IDS.branchesRead,
                  effect: PermissionEffect.ALLOW,
                },
              ],
            },
          },
        },
      }),
      prisma.userBranch.create({
        data: {
          userId: IDS.adminCanTho,
          branchId: IDS.canTho,
          isPrimary: true,
          roles: { create: { roleId: IDS.branchAdminRole } },
          permissions: {
            create: {
              permissionId: IDS.paymentsCreate,
              effect: PermissionEffect.ALLOW,
            },
          },
        },
      }),
      prisma.userBranch.create({
        data: {
          userId: IDS.staffMulti,
          branchId: IDS.hauGiang,
          isPrimary: true,
          assignedAt: new Date('2026-01-01T00:00:00.000Z'),
          roles: { create: { roleId: IDS.staffRole } },
          permissions: {
            createMany: {
              data: [
                {
                  permissionId: IDS.inventoryUpdate,
                  effect: PermissionEffect.ALLOW,
                },
                {
                  permissionId: IDS.paymentsCreate,
                  effect: PermissionEffect.DENY,
                },
                {
                  permissionId: IDS.staffRead,
                  effect: PermissionEffect.DENY,
                },
              ],
            },
          },
        },
      }),
      prisma.userBranch.create({
        data: {
          userId: IDS.staffMulti,
          branchId: IDS.canTho,
          isPrimary: false,
          assignedAt: new Date('2026-01-02T00:00:00.000Z'),
          roles: { create: { roleId: IDS.cashierRole } },
          permissions: {
            createMany: {
              data: [
                {
                  permissionId: IDS.paymentsCreate,
                  effect: PermissionEffect.ALLOW,
                },
                {
                  permissionId: IDS.inventoryUpdate,
                  effect: PermissionEffect.DENY,
                },
                {
                  permissionId: IDS.staffRead,
                  effect: PermissionEffect.ALLOW,
                },
              ],
            },
          },
        },
      }),
      prisma.userBranch.create({
        data: {
          userId: IDS.staffLastBranch,
          branchId: IDS.hauGiang,
          isPrimary: true,
          roles: { create: { roleId: IDS.staffRole } },
          permissions: {
            create: {
              permissionId: IDS.inventoryUpdate,
              effect: PermissionEffect.ALLOW,
            },
          },
        },
      }),
      prisma.userBranch.create({
        data: {
          userId: IDS.transferNewDestination,
          branchId: IDS.hauGiang,
          isPrimary: true,
          roles: { create: { roleId: IDS.staffRole } },
          permissions: {
            create: {
              permissionId: IDS.inventoryUpdate,
              effect: PermissionEffect.ALLOW,
            },
          },
        },
      }),
      prisma.userBranch.create({
        data: {
          userId: IDS.transferInactiveDestination,
          branchId: IDS.hauGiang,
          isPrimary: true,
          roles: { create: { roleId: IDS.staffRole } },
        },
      }),
      prisma.userBranch.create({
        data: {
          userId: IDS.transferInactiveDestination,
          branchId: IDS.vinhLong,
          isActive: false,
          isPrimary: false,
          roles: { create: { roleId: IDS.staffRole } },
          permissions: {
            create: {
              permissionId: IDS.inventoryUpdate,
              effect: PermissionEffect.ALLOW,
            },
          },
        },
      }),
      prisma.userBranch.create({
        data: {
          userId: IDS.transferNonPrimary,
          branchId: IDS.hauGiang,
          isPrimary: true,
          roles: { create: { roleId: IDS.staffRole } },
        },
      }),
      prisma.userBranch.create({
        data: {
          userId: IDS.transferNonPrimary,
          branchId: IDS.canTho,
          isPrimary: false,
          roles: { create: { roleId: IDS.staffRole } },
        },
      }),
      prisma.userBranch.create({
        data: {
          userId: IDS.transferRollbackAfterWrite,
          branchId: IDS.hauGiang,
          isPrimary: false,
          roles: { create: { roleId: IDS.staffRole } },
        },
      }),
      prisma.userBranch.create({
        data: {
          userId: IDS.transferConcurrent,
          branchId: IDS.hauGiang,
          isPrimary: true,
          roles: { create: { roleId: IDS.staffRole } },
        },
      }),
      prisma.userBranch.create({
        data: {
          userId: IDS.transferNoHeader,
          branchId: IDS.hauGiang,
          isPrimary: true,
          roles: { create: { roleId: IDS.staffRole } },
        },
      }),
    ]);

  void aHauGiang;
  void cCanTho;
  void bLast;

  await prisma.order.create({
    data: {
      id: IDS.order,
      orderCode: 'ORDER-CUSTOMER-CONVERT',
      userId: IDS.customer,
      branchId: IDS.hauGiang,
      status: OrderStatus.PENDING,
      subtotalAmount: 100_000,
      totalAmount: 100_000,
      receiverName: 'Customer',
      receiverPhone: '0900000000',
      shippingAddress: 'Hậu Giang',
    },
  });

  return {
    bHauGiangUserBranchId: bHauGiang.id,
    bCanThoUserBranchId: bCanTho.id,
  };
}

async function createAuth(
  prisma: PrismaService,
  jwtService: JwtService,
  userId: string,
): Promise<AuthCookies> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, email: true },
  });
  const session = await prisma.authSession.create({
    data: {
      userId,
      refreshTokenHash: `hash-${userId}`,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  const token = await jwtService.signAsync(
    { sub: user.id, email: user.email, sid: session.id },
    { secret: process.env.JWT_ACCESS_SECRET, expiresIn: '15m' },
  );
  return {
    cookie: `accessToken=${token}`,
    csrfCookie: `accessToken=${token}; csrfToken=${CSRF}`,
  };
}

function withCsrf(auth: AuthCookies): string {
  return auth.csrfCookie;
}

function user(id: string, email: string, type: UserType) {
  return {
    id,
    email,
    fullName: email,
    type,
    provider: AuthProvider.LOCAL,
  };
}

function permission(
  id: string,
  code: string,
  resource: string,
  action: string,
) {
  return {
    id,
    code,
    name: code,
    resource,
    action,
  };
}
