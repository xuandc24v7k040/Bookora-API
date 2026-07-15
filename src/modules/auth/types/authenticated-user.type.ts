import type { UserType } from '@/generated/prisma/client';

export interface AuthenticatedRole {
  id: string;
  code: string;
  level: number;
  type: UserType;
  isSystem: boolean;
}

export interface AuthenticatedBranch {
  id: string;
  code: string;
  name: string;
  isPrimary: boolean;
}

export interface AuthenticatedBranchAssignment {
  branchId: string;
  userBranchId: string;
  branch: AuthenticatedBranch;
  isPrimary: boolean;
  isActive: boolean;
  roles: AuthenticatedRole[];
  permissions: string[];
  maxRoleLevel: number;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  gender: string | null;
  birthday: string | null;
  type: UserType;
  roles: AuthenticatedRole[];
  permissions: string[];
  globalRoles: AuthenticatedRole[];
  globalPermissions: string[];
  branchAssignments: AuthenticatedBranchAssignment[];
  allowedBranchIds: string[];
  branches: AuthenticatedBranch[];
  primaryBranchId: string | null;
  maxRoleLevel: number;
  isSuperAdmin: boolean;
  sessionId: string;
}
