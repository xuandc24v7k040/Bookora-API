import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';
import type { BranchContext } from '@/modules/authorization';
import {
  RevenueGroupBy,
  RevenuePaymentMethod,
  RevenueSortOrder,
  type RevenueReportQueryDto,
} from './dto';
import { RevenueReportsService } from './revenue-reports.service';

const query: RevenueReportQueryDto = {
  from: '2026-07-01',
  to: '2026-07-31',
  groupBy: RevenueGroupBy.DAY,
  paymentMethod: RevenuePaymentMethod.ALL,
  page: 1,
  limit: 10,
  sortOrder: RevenueSortOrder.ASC,
};

const summaryRow = {
  completedRevenue: 1_000,
  completedOrders: 2,
  soldQuantity: 3,
  merchandiseRevenue: 900,
  shippingRevenue: 100,
  completionRate: 50,
};

const branchRow = {
  branchId: 'branch-1',
  branchCode: 'can-tho',
  branchName: 'Chi nhánh Cần Thơ',
  isActive: true,
  completedOrders: 2,
  soldQuantity: 3,
  totalRevenue: 1_000,
};

function actor(isSuperAdmin: boolean): AuthenticatedUser {
  return {
    id: 'user-1',
    email: 'staff@bookora.local',
    fullName: 'Bookora Staff',
    phone: null,
    gender: null,
    birthday: null,
    avatarUrl: null,
    type: isSuperAdmin ? 'SYSTEM' : 'BRANCH',
    roles: [],
    permissions: [],
    globalRoles: [],
    globalPermissions: [],
    branchAssignments: [],
    allowedBranchIds: isSuperAdmin ? [] : ['branch-1'],
    branches: [],
    primaryBranchId: isSuperAdmin ? null : 'branch-1',
    maxRoleLevel: isSuperAdmin ? 100 : 10,
    isSuperAdmin,
    sessionId: 'session-1',
  };
}

function selectedBranch(): BranchContext {
  return {
    scope: 'SELECTED',
    selectedBranchId: 'branch-1',
    allowedBranchIds: ['branch-1'],
  };
}

describe('RevenueReportsService leading branch', () => {
  const repository = {
    summary: jest.fn(),
    branches: jest.fn(),
    findBranch: jest.fn(),
  };
  const service = new RevenueReportsService(repository as never, {} as never);

  beforeEach(() => {
    jest.clearAllMocks();
    repository.summary.mockResolvedValue(summaryRow);
    repository.branches.mockResolvedValue([branchRow]);
    repository.findBranch.mockResolvedValue(null);
  });

  it('returns the leading branch only for a Super Admin global scope', async () => {
    const result = await service.summary(
      actor(true),
      {
        scope: 'ALL',
        selectedBranchId: null,
        allowedBranchIds: null,
      },
      query,
    );

    expect(result.leadingBranch).toEqual({
      ...branchRow,
      averageOrderValue: 500,
    });
    expect(repository.branches).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['Super Admin branch scope', actor(true)],
    ['Branch Admin branch scope', actor(false)],
    ['STAFF branch scope', actor(false)],
  ])('omits branch aggregation for %s', async (_label, scopedActor) => {
    const result = await service.summary(scopedActor, selectedBranch(), query);

    expect(result.leadingBranch).toBeNull();
    expect(repository.branches).not.toHaveBeenCalled();
  });
});
