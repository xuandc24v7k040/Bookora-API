import { UserType } from '@/generated/prisma/client';
import { resolveAnalyticsScope } from './analytics-scope';

const superAdmin = {
  isSuperAdmin: true,
  type: UserType.SYSTEM,
} as never;
const branchAdmin = {
  isSuperAdmin: false,
  type: UserType.BRANCH,
} as never;

describe('analytics scope', () => {
  it('allows only Super Admin to use global scope', () => {
    expect(
      resolveAnalyticsScope(superAdmin, {
        scope: 'ALL',
        selectedBranchId: null,
        allowedBranchIds: null,
      }),
    ).toEqual({ mode: 'GLOBAL', branchIds: null, branchId: null });
    expect(() =>
      resolveAnalyticsScope(branchAdmin, {
        scope: 'ALLOWED_SET',
        selectedBranchId: null,
        allowedBranchIds: ['branch-1'],
      }),
    ).toThrow('Vui lòng chọn một chi nhánh');
  });

  it('uses only the selected branch for both admin types', () => {
    expect(
      resolveAnalyticsScope(branchAdmin, {
        scope: 'SELECTED',
        selectedBranchId: 'branch-1',
        allowedBranchIds: ['branch-1'],
      }),
    ).toEqual({
      mode: 'BRANCH',
      branchIds: ['branch-1'],
      branchId: 'branch-1',
    });
  });
});
