import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UserType } from '@/generated/prisma/client';
import { BranchContextService } from './branch-context.service';
import type { AuthorizationRequest } from './types/authorization-request.type';
import { BranchScopeMode } from './types/branch-context.type';

const BRANCH_ID = '01JZ0000000000000000000100';
const OTHER_BRANCH_ID = '01JZ0000000000000000000200';

describe('BranchContextService', () => {
  const repository = { findActiveBranchById: jest.fn() };
  let service: BranchContextService;

  beforeEach(() => {
    jest.clearAllMocks();
    repository.findActiveBranchById.mockResolvedValue({ id: BRANCH_ID });
    service = new BranchContextService(repository as never);
  });

  it('gives Super Admin all-branch scope for optional selection', async () => {
    const context = await service.resolveBranchContext(
      request(superAdmin()),
      BranchScopeMode.OPTIONAL_SELECTION,
    );

    expect(context).toEqual({
      scope: 'ALL',
      selectedBranchId: null,
      allowedBranchIds: null,
    });
  });

  it('requires Super Admin to select a branch for required selection', async () => {
    await expect(
      service.resolveBranchContext(
        request(superAdmin()),
        BranchScopeMode.REQUIRED_SELECTION,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('uses the complete allowed set for a Branch user without a header', async () => {
    const context = await service.resolveBranchContext(
      request(branchActor([BRANCH_ID, OTHER_BRANCH_ID])),
      BranchScopeMode.OPTIONAL_SELECTION,
    );

    expect(context).toEqual({
      scope: 'ALLOWED_SET',
      selectedBranchId: null,
      allowedBranchIds: [BRANCH_ID, OTHER_BRANCH_ID],
    });
  });

  it('creates NONE scope rather than an unrestricted scope for a Branch user without branches', async () => {
    const context = await service.resolveBranchContext(
      request(branchActor([])),
      BranchScopeMode.OPTIONAL_SELECTION,
    );

    expect(context).toEqual({
      scope: 'NONE',
      selectedBranchId: null,
      allowedBranchIds: [],
    });
    expect(service.buildBranchWhere(context)).toEqual({
      scope: 'FILTERED',
      where: { branchId: { in: [] } },
    });
  });

  it('validates and attaches a selected branch once per request', async () => {
    const targetRequest = request(branchActor([BRANCH_ID]), BRANCH_ID);
    const first = await service.resolveBranchContext(
      targetRequest,
      BranchScopeMode.REQUIRED_SELECTION,
    );
    const second = await service.resolveBranchContext(
      targetRequest,
      BranchScopeMode.REQUIRED_SELECTION,
    );

    expect(first).toEqual({
      scope: 'SELECTED',
      selectedBranchId: BRANCH_ID,
      allowedBranchIds: [BRANCH_ID],
    });
    expect(second).toBe(first);
    expect(repository.findActiveBranchById).toHaveBeenCalledTimes(1);
  });

  it('switches effective authorization to the selected branch assignment', async () => {
    const actor = branchActor([BRANCH_ID, OTHER_BRANCH_ID], {
      roles: [],
      permissions: [],
      maxRoleLevel: 0,
      branchAssignments: [
        {
          branchId: BRANCH_ID,
          userBranchId: 'ub-hau-giang',
          branch: {
            id: BRANCH_ID,
            code: 'hau-giang',
            name: 'Hậu Giang',
            isPrimary: true,
          },
          isPrimary: true,
          isActive: true,
          roles: [
            {
              id: 'staff-role',
              code: 'STAFF',
              level: 30,
              type: UserType.BRANCH,
              isSystem: true,
            },
          ],
          permissions: ['inventory.update'],
          maxRoleLevel: 30,
        },
        {
          branchId: OTHER_BRANCH_ID,
          userBranchId: 'ub-can-tho',
          branch: {
            id: OTHER_BRANCH_ID,
            code: 'can-tho',
            name: 'Cần Thơ',
            isPrimary: false,
          },
          isPrimary: false,
          isActive: true,
          roles: [],
          permissions: ['payments.create'],
          maxRoleLevel: 20,
        },
      ],
    });

    await service.resolveBranchContext(
      request(actor, BRANCH_ID),
      BranchScopeMode.REQUIRED_SELECTION,
    );

    expect(actor.permissions).toEqual(['inventory.update']);
    expect(actor.permissions).not.toContain('payments.create');
    expect(actor.maxRoleLevel).toBe(30);
  });

  it('rejects a selected branch outside actor scope', async () => {
    await expect(
      service.resolveBranchContext(
        request(branchActor([OTHER_BRANCH_ID]), BRANCH_ID),
        BranchScopeMode.REQUIRED_SELECTION,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each([
    '',
    'invalid',
    BRANCH_ID.toLowerCase(),
    `${BRANCH_ID},${OTHER_BRANCH_ID}`,
    [BRANCH_ID, OTHER_BRANCH_ID],
  ])('rejects a %s branch header', async (header) => {
    await expect(
      service.resolveBranchContext(
        request(branchActor([BRANCH_ID]), header),
        BranchScopeMode.OPTIONAL_SELECTION,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a missing or inactive branch', async () => {
    repository.findActiveBranchById.mockResolvedValue(null);

    await expect(
      service.resolveBranchContext(
        request(superAdmin(), BRANCH_ID),
        BranchScopeMode.OPTIONAL_SELECTION,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a Customer from admin branch scope', async () => {
    await expect(
      service.resolveBranchContext(
        request(branchActor([], { type: UserType.CUSTOMER })),
        BranchScopeMode.OPTIONAL_SELECTION,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('builds explicit unrestricted and selected branch contracts', () => {
    expect(
      service.buildBranchWhere({
        scope: 'ALL',
        selectedBranchId: null,
        allowedBranchIds: null,
      }),
    ).toEqual({ scope: 'UNRESTRICTED' });
    expect(
      service.buildBranchWhere({
        scope: 'SELECTED',
        selectedBranchId: BRANCH_ID,
        allowedBranchIds: null,
      }),
    ).toEqual({ scope: 'FILTERED', where: { branchId: BRANCH_ID } });
  });

  it('hides an out-of-scope resource as not found', () => {
    expect(() =>
      service.assertResourceBranchAccess(
        {
          scope: 'NONE',
          selectedBranchId: null,
          allowedBranchIds: [],
        },
        BRANCH_ID,
      ),
    ).toThrow(NotFoundException);
  });
});

function request(
  user: ReturnType<typeof branchActor>,
  header?: string | string[],
): AuthorizationRequest {
  return {
    user,
    headers: header === undefined ? {} : { 'x-branch-id': header },
  } as unknown as AuthorizationRequest;
}

function branchActor(
  allowedBranchIds: string[] = [],
  overrides: Record<string, unknown> = {},
) {
  return {
    id: 'actor-id',
    email: 'actor@example.com',
    fullName: 'Actor',
    type: UserType.BRANCH,
    roles: [],
    permissions: [],
    allowedBranchIds,
    branches: [],
    primaryBranchId: null,
    maxRoleLevel: 70,
    isSuperAdmin: false,
    sessionId: 'session-id',
    ...overrides,
  };
}

function superAdmin() {
  return branchActor([], {
    type: UserType.SYSTEM,
    maxRoleLevel: 100,
    isSuperAdmin: true,
  });
}
