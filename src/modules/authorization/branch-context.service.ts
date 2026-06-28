import { Injectable } from '@nestjs/common';
import { UserType } from '@/generated/prisma/client';
import {
  AUTHORIZATION_ERROR_CODES,
  BRANCH_ID_HEADER,
} from './authorization.constants';
import {
  authorizationBadRequest,
  authorizationForbidden,
  authorizationNotFound,
} from './authorization.errors';
import { AuthorizationRepository } from './authorization.repository';
import type { AuthorizationRequest } from './types/authorization-request.type';
import {
  BranchScopeMode,
  type BranchContext,
  type BranchWhere,
} from './types/branch-context.type';

const ULID_PATTERN = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

@Injectable()
export class BranchContextService {
  constructor(
    private readonly authorizationRepository: AuthorizationRepository,
  ) {}

  async resolveBranchContext(
    request: AuthorizationRequest,
    mode: BranchScopeMode,
  ): Promise<BranchContext> {
    if (request.branchContext) {
      return request.branchContext;
    }

    const actor = request.user;
    if (!actor) {
      throw authorizationForbidden(
        AUTHORIZATION_ERROR_CODES.branchAccessDenied,
        'Không thể xác định phạm vi chi nhánh',
      );
    }

    if (actor.type === UserType.CUSTOMER) {
      throw authorizationForbidden(
        AUTHORIZATION_ERROR_CODES.branchAccessDenied,
        'Tài khoản khách hàng không có quyền truy cập phạm vi chi nhánh',
      );
    }

    const selectedBranchId = this.readSelectedBranchId(request);
    if (!selectedBranchId) {
      if (mode === BranchScopeMode.REQUIRED_SELECTION) {
        throw authorizationBadRequest(
          AUTHORIZATION_ERROR_CODES.branchSelectionRequired,
          'Vui lòng chọn chi nhánh',
        );
      }

      const context: BranchContext = actor.isSuperAdmin
        ? {
            scope: 'ALL',
            selectedBranchId: null,
            allowedBranchIds: null,
          }
        : actor.allowedBranchIds.length > 0
          ? {
              scope: 'ALLOWED_SET',
              selectedBranchId: null,
              allowedBranchIds: [...new Set(actor.allowedBranchIds)],
            }
          : {
              scope: 'NONE',
              selectedBranchId: null,
              allowedBranchIds: [],
            };

      request.branchContext = context;
      return context;
    }

    const branch =
      await this.authorizationRepository.findActiveBranchById(selectedBranchId);
    if (!branch) {
      throw authorizationNotFound(
        AUTHORIZATION_ERROR_CODES.branchNotFound,
        'Không tìm thấy chi nhánh đang hoạt động',
      );
    }

    if (!actor.isSuperAdmin && !actor.allowedBranchIds.includes(branch.id)) {
      throw authorizationForbidden(
        AUTHORIZATION_ERROR_CODES.branchAccessDenied,
        'Chi nhánh nằm ngoài phạm vi được phép',
      );
    }

    const context: BranchContext = {
      scope: 'SELECTED',
      selectedBranchId: branch.id,
      allowedBranchIds: actor.isSuperAdmin
        ? null
        : [...new Set(actor.allowedBranchIds)],
    };
    if (!actor.isSuperAdmin && actor.branchAssignments) {
      const selectedAssignment = actor.branchAssignments.find(
        (assignment) =>
          assignment.branchId === branch.id && assignment.isActive,
      );
      if (!selectedAssignment) {
        throw authorizationForbidden(
          AUTHORIZATION_ERROR_CODES.branchAccessDenied,
          'Chi nhánh nằm ngoài phạm vi được phép',
        );
      }
      actor.roles = selectedAssignment.roles;
      actor.permissions = selectedAssignment.permissions;
      actor.maxRoleLevel = selectedAssignment.maxRoleLevel;
    }
    request.branchContext = context;
    return context;
  }

  requireSelectedBranch(context: BranchContext): string {
    if (context.scope === 'SELECTED') {
      return context.selectedBranchId;
    }

    throw authorizationBadRequest(
      AUTHORIZATION_ERROR_CODES.branchSelectionRequired,
      'Thao tác yêu cầu một chi nhánh cụ thể',
    );
  }

  assertBranchAccess(context: BranchContext, branchId: string): void {
    if (
      context.scope === 'ALL' ||
      (context.scope === 'SELECTED' && context.selectedBranchId === branchId) ||
      (context.scope === 'ALLOWED_SET' &&
        context.allowedBranchIds.includes(branchId))
    ) {
      return;
    }

    throw authorizationForbidden(
      AUTHORIZATION_ERROR_CODES.branchAccessDenied,
      'Chi nhánh nằm ngoài phạm vi được phép',
    );
  }

  assertResourceBranchAccess(
    context: BranchContext,
    resourceBranchId: string,
  ): void {
    try {
      this.assertBranchAccess(context, resourceBranchId);
    } catch {
      throw authorizationNotFound(
        AUTHORIZATION_ERROR_CODES.branchNotFound,
        'Không tìm thấy tài nguyên',
      );
    }
  }

  buildBranchWhere(context: BranchContext): BranchWhere {
    if (context.scope === 'ALL') {
      return { scope: 'UNRESTRICTED' };
    }

    if (context.scope === 'SELECTED') {
      return {
        scope: 'FILTERED',
        where: { branchId: context.selectedBranchId },
      };
    }

    return {
      scope: 'FILTERED',
      where: { branchId: { in: context.allowedBranchIds } },
    };
  }

  private readSelectedBranchId(request: AuthorizationRequest): string | null {
    const rawValue = request.headers[BRANCH_ID_HEADER];
    if (rawValue === undefined) {
      return null;
    }

    if (Array.isArray(rawValue) && rawValue.length !== 1) {
      this.throwMalformedBranchHeader();
    }

    const value = (Array.isArray(rawValue) ? rawValue[0] : rawValue).trim();
    if (!value || value.includes(',')) {
      this.throwMalformedBranchHeader();
    }

    if (!ULID_PATTERN.test(value)) {
      this.throwMalformedBranchHeader();
    }

    return value;
  }

  private throwMalformedBranchHeader(): never {
    throw authorizationBadRequest(
      AUTHORIZATION_ERROR_CODES.branchSelectionRequired,
      'Header X-Branch-Id không hợp lệ',
    );
  }
}
