import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';
import type { BranchContext } from '@/modules/authorization';

export interface AnalyticsScope {
  mode: 'GLOBAL' | 'BRANCH';
  branchIds: string[] | null;
  branchId: string | null;
}

export function resolveAnalyticsScope(
  actor: AuthenticatedUser,
  context: BranchContext,
): AnalyticsScope {
  if (context.scope === 'SELECTED') {
    return {
      mode: 'BRANCH',
      branchIds: [context.selectedBranchId],
      branchId: context.selectedBranchId,
    };
  }
  if (actor.isSuperAdmin && context.scope === 'ALL') {
    return { mode: 'GLOBAL', branchIds: null, branchId: null };
  }
  throw new ForbiddenException({
    code: 'ANALYTICS_BRANCH_FORBIDDEN',
    message: 'Vui lòng chọn một chi nhánh được phân quyền.',
  });
}

export function percentageChange(
  current: number,
  previous: number,
): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 10_000) / 100;
}
