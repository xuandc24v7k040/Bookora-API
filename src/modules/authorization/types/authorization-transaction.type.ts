import type { Prisma } from '@/generated/prisma/client';

export type AuthorizationTransactionClient = Pick<
  Prisma.TransactionClient,
  | 'user'
  | 'role'
  | 'permission'
  | 'userRole'
  | 'rolePermission'
  | 'userPermission'
  | 'userBranch'
  | 'userBranchRole'
  | 'userBranchPermission'
  | 'branch'
  | 'authSession'
>;
