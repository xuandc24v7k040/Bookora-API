import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';

export function hasOrderProcessingPermissions(
  permissions: readonly string[],
): boolean {
  return (
    permissions.includes('orders.read') &&
    (permissions.includes('orders.update_status') ||
      permissions.includes('orders.cancel'))
  );
}

export function canReceiveNotifications(
  principal: AuthenticatedUser,
  branchId: string | null,
): boolean {
  if (branchId === null) return principal.type === 'CUSTOMER';
  return (
    principal.type === 'BRANCH' &&
    !principal.isSuperAdmin &&
    principal.branchAssignments.some(
      (assignment) =>
        assignment.branchId === branchId &&
        assignment.isActive &&
        hasOrderProcessingPermissions(assignment.permissions),
    )
  );
}
