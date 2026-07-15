import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
  applyDecorators,
} from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiBaseResponse,
  ApiPaginatedResponse,
  UlidParam,
} from '@/common/decorators';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { CsrfGuard } from '../../auth/guards/csrf.guard';
import { JwtAccessGuard } from '../../auth/guards/jwt-access.guard';
import type { AuthenticatedUser } from '../../auth/types/authenticated-user.type';
import { AuthorizationManagementService } from '../authorization-management.service';
import { BranchScope } from '../decorators/branch-scope.decorator';
import { CurrentBranchContext } from '../decorators/current-branch-context.decorator';
import { Permissions } from '../decorators/permissions.decorator';
import { BranchScopeGuard } from '../guards/branch-scope.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import {
  BranchScopeMode,
  type BranchContext,
} from '../types/branch-context.type';
import {
  BranchResponseDto,
  BranchListQueryDto,
  CatalogQueryDto,
  ChangePrimaryBranchDto,
  ConvertBranchAdminDto,
  ConvertStaffDto,
  CreateBranchDto,
  CreateInternalUserDto,
  CreatePermissionDto,
  CreateRoleDto,
  CreateStaffDto,
  ManagedUserResponseDto,
  MutationCountResponseDto,
  PermissionDetailResponseDto,
  PermissionResponseDto,
  RoleDetailResponseDto,
  RolePermissionResponseDto,
  RoleResponseDto,
  StaffAssignmentsResponseDto,
  TransferStaffBranchDto,
  UpdateBranchDto,
  UpdatePermissionDto,
  UpdateRoleDto,
  UpdateStaffDto,
  UpsertUserPermissionDto,
  UserBranchCreateResponseDto,
  UserBranchPermissionResponseDto,
  UserBranchRoleResponseDto,
  UserBranchStateResponseDto,
} from '../dto';

const guards = [JwtAccessGuard, CsrfGuard, BranchScopeGuard, PermissionsGuard];
const ApiAuthorizationErrors = () =>
  applyDecorators(
    ApiResponse({
      status: 400,
      description: 'Invalid request or branch selection',
      schema: { $ref: '#/components/schemas/ErrorResponseDto' },
    }),
    ApiResponse({
      status: 401,
      description: 'Authentication required',
      schema: { $ref: '#/components/schemas/ErrorResponseDto' },
    }),
    ApiResponse({
      status: 403,
      description: 'Permission or scope denied',
      schema: { $ref: '#/components/schemas/ErrorResponseDto' },
    }),
    ApiResponse({
      status: 404,
      description: 'Resource not found in scope',
      schema: { $ref: '#/components/schemas/ErrorResponseDto' },
    }),
    ApiResponse({
      status: 409,
      description: 'Conflicting authorization data',
      schema: { $ref: '#/components/schemas/ErrorResponseDto' },
    }),
  );

@ApiTags('roles')
@ApiSecurity('accessToken')
@ApiAuthorizationErrors()
@Controller('roles')
@UseGuards(...guards)
export class RolesController {
  constructor(private readonly service: AuthorizationManagementService) {}

  @Get()
  @Permissions('roles.read')
  @ApiOperation({ summary: 'List roles' })
  @ApiPaginatedResponse(RoleResponseDto, 'Roles retrieved')
  list(@Query() query: CatalogQueryDto) {
    return this.service.listRoles(query);
  }

  @Get(':id')
  @Permissions('roles.read')
  @ApiOperation({ summary: 'Get role detail' })
  @ApiBaseResponse(RoleDetailResponseDto, { description: 'Role retrieved' })
  get(@UlidParam() id: string) {
    return this.service.getRole(id);
  }

  @Post()
  @Permissions('roles.create')
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Create custom role' })
  @ApiBaseResponse(RoleResponseDto, {
    status: 201,
    description: 'Role created',
  })
  create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateRoleDto) {
    return this.service.createRole(actor, dto);
  }

  @Patch(':id')
  @Permissions('roles.update')
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Update role' })
  @ApiBaseResponse(RoleResponseDto, { description: 'Role updated' })
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @UlidParam() id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.service.updateRole(actor, id, dto);
  }

  @Delete(':id')
  @Permissions('roles.delete')
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Deactivate role' })
  @ApiBaseResponse(RoleResponseDto, { description: 'Role deactivated' })
  deactivate(@CurrentUser() actor: AuthenticatedUser, @UlidParam() id: string) {
    return this.service.deactivateRole(actor, id);
  }

  @Get(':id/permissions')
  @Permissions('roles.read')
  @ApiOperation({ summary: 'List role permissions' })
  @ApiBaseResponse(RolePermissionResponseDto, {
    description: 'Role permissions retrieved',
    isArray: true,
  })
  permissions(@UlidParam() id: string) {
    return this.service.listRolePermissions(id);
  }

  @Post(':id/permissions/:permissionId')
  @Permissions('roles.assign_permission')
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Assign permission to role' })
  @ApiBaseResponse(RolePermissionResponseDto, {
    status: 201,
    description: 'Role permission assigned',
  })
  assignPermission(
    @CurrentUser() actor: AuthenticatedUser,
    @UlidParam() id: string,
    @UlidParam('permissionId') permissionId: string,
  ) {
    return this.service.assignRolePermission(actor, id, permissionId);
  }

  @Delete(':id/permissions/:permissionId')
  @Permissions('roles.assign_permission')
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Remove permission from role' })
  @ApiBaseResponse(MutationCountResponseDto, {
    description: 'Role permission removed',
  })
  removePermission(
    @CurrentUser() actor: AuthenticatedUser,
    @UlidParam() id: string,
    @UlidParam('permissionId') permissionId: string,
  ) {
    return this.service.removeRolePermission(actor, id, permissionId);
  }
}

@ApiTags('permissions')
@ApiSecurity('accessToken')
@ApiAuthorizationErrors()
@Controller('permissions')
@UseGuards(...guards)
export class PermissionsController {
  constructor(private readonly service: AuthorizationManagementService) {}
  @Get()
  @Permissions('permissions.read')
  @ApiOperation({ summary: 'List permissions' })
  @ApiPaginatedResponse(PermissionResponseDto, 'Permissions retrieved')
  list(@Query() query: CatalogQueryDto) {
    return this.service.listPermissions(query);
  }
  @Get(':id')
  @Permissions('permissions.read')
  @ApiOperation({ summary: 'Get permission detail' })
  @ApiBaseResponse(PermissionDetailResponseDto, {
    description: 'Permission retrieved',
  })
  get(@UlidParam() id: string) {
    return this.service.getPermission(id);
  }
  @Post()
  @Permissions('permissions.create')
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Create permission' })
  @ApiBaseResponse(PermissionResponseDto, {
    status: 201,
    description: 'Permission created',
  })
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreatePermissionDto,
  ) {
    return this.service.createPermission(actor, dto);
  }
  @Patch(':id')
  @Permissions('permissions.update')
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Update permission' })
  @ApiBaseResponse(PermissionResponseDto, {
    description: 'Permission updated',
  })
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @UlidParam() id: string,
    @Body() dto: UpdatePermissionDto,
  ) {
    return this.service.updatePermission(actor, id, dto);
  }
  @Delete(':id')
  @Permissions('permissions.delete')
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Delete unused permission' })
  @ApiBaseResponse(PermissionDetailResponseDto, {
    description: 'Permission deleted',
  })
  remove(@CurrentUser() actor: AuthenticatedUser, @UlidParam() id: string) {
    return this.service.deletePermission(actor, id);
  }
}

@ApiTags('branches')
@ApiSecurity('accessToken')
@ApiAuthorizationErrors()
@Controller('branches')
@UseGuards(...guards)
export class BranchesController {
  constructor(private readonly service: AuthorizationManagementService) {}
  @Get()
  @Permissions('branches.read')
  @BranchScope(BranchScopeMode.OPTIONAL_SELECTION)
  @ApiHeader({ name: 'X-Branch-Id', required: false })
  @ApiOperation({ summary: 'List branches in scope' })
  @ApiPaginatedResponse(BranchResponseDto, 'Branches retrieved')
  list(
    @CurrentBranchContext() context: BranchContext,
    @Query() query: BranchListQueryDto,
  ) {
    return this.service.listBranches(context, query);
  }
  @Get(':id')
  @Permissions('branches.read')
  @BranchScope(BranchScopeMode.OPTIONAL_SELECTION)
  @ApiHeader({ name: 'X-Branch-Id', required: false })
  @ApiOperation({ summary: 'Get branch in scope' })
  @ApiBaseResponse(BranchResponseDto, { description: 'Branch retrieved' })
  get(@CurrentBranchContext() context: BranchContext, @UlidParam() id: string) {
    return this.service.getBranch(context, id);
  }
  @Post()
  @Permissions('branches.create')
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Create branch' })
  @ApiBaseResponse(BranchResponseDto, {
    status: 201,
    description: 'Branch created',
  })
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateBranchDto,
  ) {
    return this.service.createBranch(actor, dto);
  }
  @Patch(':id')
  @Permissions('branches.update')
  @BranchScope(BranchScopeMode.OPTIONAL_SELECTION)
  @ApiHeader({ name: 'X-Branch-Id', required: false })
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Update branch' })
  @ApiBaseResponse(BranchResponseDto, { description: 'Branch updated' })
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentBranchContext() context: BranchContext,
    @UlidParam() id: string,
    @Body() dto: UpdateBranchDto,
  ) {
    return this.service.updateBranch(actor, context, id, dto);
  }
  @Delete(':id')
  @Permissions('branches.delete')
  @BranchScope(BranchScopeMode.OPTIONAL_SELECTION)
  @ApiHeader({ name: 'X-Branch-Id', required: false })
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Deactivate branch' })
  @ApiBaseResponse(BranchResponseDto, { description: 'Branch deactivated' })
  deactivate(
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentBranchContext() context: BranchContext,
    @UlidParam() id: string,
  ) {
    return this.service.deactivateBranch(actor, context, id);
  }
}

@ApiTags('branch-admins')
@ApiSecurity('accessToken')
@ApiAuthorizationErrors()
@Controller('branch-admins')
@UseGuards(...guards)
export class BranchAdminsController {
  constructor(private readonly service: AuthorizationManagementService) {}
  @Get()
  @Permissions('users.read', 'branches.read')
  @ApiOperation({ summary: 'List Branch Admins' })
  @ApiPaginatedResponse(ManagedUserResponseDto, 'Branch Admins retrieved')
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: CatalogQueryDto,
  ) {
    return this.service.listBranchAdmins(actor, query);
  }
  @Get(':id')
  @Permissions('users.read', 'branches.read')
  @ApiOperation({ summary: 'Get Branch Admin detail' })
  @ApiBaseResponse(ManagedUserResponseDto, {
    description: 'Branch Admin retrieved',
  })
  get(@CurrentUser() actor: AuthenticatedUser, @UlidParam() id: string) {
    return this.service.getBranchAdmin(actor, id);
  }
  @Post()
  @Permissions('branch_admin.assign', 'branches.assign')
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Create Branch Admin' })
  @ApiBaseResponse(ManagedUserResponseDto, {
    status: 201,
    description: 'Branch Admin created',
  })
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateInternalUserDto,
  ) {
    return this.service.createBranchAdmin(actor, dto);
  }
  @Post(':id/convert')
  @Permissions('branch_admin.assign', 'branches.assign')
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Convert Customer to Branch Admin' })
  @ApiBaseResponse(ManagedUserResponseDto, {
    status: 201,
    description: 'Customer converted to Branch Admin',
  })
  convert(
    @CurrentUser() actor: AuthenticatedUser,
    @UlidParam() id: string,
    @Body() dto: ConvertBranchAdminDto,
  ) {
    return this.service.convertToBranchAdmin(actor, id, dto);
  }
  @Post(':id/branches/:branchId')
  @Permissions('branch_admin.assign', 'branches.assign')
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Assign branch to Branch Admin' })
  @ApiBaseResponse(UserBranchCreateResponseDto, {
    status: 201,
    description: 'Branch assigned',
  })
  assignBranch(
    @CurrentUser() actor: AuthenticatedUser,
    @UlidParam() id: string,
    @UlidParam('branchId') branchId: string,
  ) {
    return this.service.assignUserBranch(actor, id, branchId, 'BRANCH_ADMIN');
  }
  @Patch(':id/branches/:branchId/activate')
  @Permissions('branch_admin.assign', 'branches.assign')
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Activate Branch Admin branch assignment' })
  @ApiBaseResponse(UserBranchStateResponseDto, {
    description: 'Branch assignment activated',
  })
  activateBranch(
    @CurrentUser() actor: AuthenticatedUser,
    @UlidParam() id: string,
    @UlidParam('branchId') branchId: string,
  ) {
    return this.service.setUserBranchActive(actor, id, branchId, true);
  }
  @Patch(':id/branches/:branchId/deactivate')
  @Permissions('branch_admin.assign', 'branches.assign')
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Deactivate Branch Admin branch assignment' })
  @ApiBaseResponse(UserBranchStateResponseDto, {
    description: 'Branch assignment deactivated',
  })
  deactivateBranch(
    @CurrentUser() actor: AuthenticatedUser,
    @UlidParam() id: string,
    @UlidParam('branchId') branchId: string,
    @Body() dto: ChangePrimaryBranchDto,
  ) {
    return this.service.setUserBranchActive(
      actor,
      id,
      branchId,
      false,
      dto.replacementBranchId,
    );
  }
  @Delete(':id/branches/:branchId')
  @Permissions('branch_admin.assign', 'branches.assign')
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Remove Branch Admin branch' })
  @ApiBaseResponse(MutationCountResponseDto, {
    description: 'Branch assignment removed',
  })
  removeBranch(
    @CurrentUser() actor: AuthenticatedUser,
    @UlidParam() id: string,
    @UlidParam('branchId') branchId: string,
    @Body() dto: ChangePrimaryBranchDto,
  ) {
    return this.service.removeUserBranch(
      actor,
      id,
      branchId,
      dto.replacementBranchId,
    );
  }
  @Patch(':id/branches/:branchId/primary')
  @Permissions('branch_admin.assign', 'branches.assign')
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Set Branch Admin primary branch' })
  @ApiBaseResponse(UserBranchStateResponseDto, {
    description: 'Primary branch changed',
  })
  primary(
    @CurrentUser() actor: AuthenticatedUser,
    @UlidParam() id: string,
    @UlidParam('branchId') branchId: string,
  ) {
    return this.service.setPrimaryUserBranch(actor, id, branchId);
  }
}

@ApiTags('staff')
@ApiSecurity('accessToken')
@ApiAuthorizationErrors()
@Controller('staff')
@UseGuards(...guards)
export class StaffController {
  constructor(private readonly service: AuthorizationManagementService) {}
  @Get()
  @Permissions('staff.read')
  @BranchScope(BranchScopeMode.REQUIRED_SELECTION)
  @ApiHeader({ name: 'X-Branch-Id', required: true })
  @ApiOperation({ summary: 'List staff in branch scope' })
  @ApiPaginatedResponse(ManagedUserResponseDto, 'Staff retrieved')
  list(
    @CurrentBranchContext() context: BranchContext,
    @Query() query: CatalogQueryDto,
  ) {
    return this.service.listStaff(context, query);
  }
  @Get(':id/assignments')
  @Permissions('staff.read')
  @ApiOperation({ summary: 'Get all branch assignments for a Staff user' })
  @ApiBaseResponse(StaffAssignmentsResponseDto, {
    description: 'Staff assignments retrieved',
  })
  assignments(
    @CurrentUser() actor: AuthenticatedUser,
    @UlidParam() id: string,
  ) {
    return this.service.getStaffAssignments(actor, id);
  }
  @Get(':id')
  @Permissions('staff.read')
  @BranchScope(BranchScopeMode.REQUIRED_SELECTION)
  @ApiHeader({ name: 'X-Branch-Id', required: true })
  @ApiOperation({ summary: 'Get staff in branch scope' })
  @ApiBaseResponse(ManagedUserResponseDto, { description: 'Staff retrieved' })
  get(@CurrentBranchContext() context: BranchContext, @UlidParam() id: string) {
    return this.service.getStaff(context, id);
  }
  @Post()
  @Permissions('staff.create')
  @BranchScope(BranchScopeMode.REQUIRED_SELECTION)
  @ApiHeader({ name: 'X-Branch-Id', required: true })
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Create staff in selected branch' })
  @ApiBaseResponse(ManagedUserResponseDto, {
    status: 201,
    description: 'Staff created',
  })
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentBranchContext() context: BranchContext,
    @Body() dto: CreateStaffDto,
  ) {
    return this.service.createStaff(actor, context, dto);
  }
  @Post(':id/convert')
  @Permissions('staff.create', 'branches.assign')
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Convert Customer to Staff' })
  @ApiBaseResponse(ManagedUserResponseDto, {
    status: 201,
    description: 'Customer converted to Staff',
  })
  convert(
    @CurrentUser() actor: AuthenticatedUser,
    @UlidParam() id: string,
    @Body() dto: ConvertStaffDto,
  ) {
    return this.service.convertToStaff(actor, id, dto);
  }
  @Post(':id/transfer-branch')
  @Permissions('staff.assign_branch')
  @ApiSecurity('csrf')
  @ApiOperation({
    summary: 'Chuyển hẳn Staff sang chi nhánh khác',
    description:
      'Chỉ Super Admin được gọi. API chạy atomically: kích hoạt assignment chi nhánh đích với role đích được chỉ định rõ, xóa direct permission cũ tại assignment đích, deactivate assignment chi nhánh nguồn, giữ nguyên session và kiểm tra invariant đúng một active primary branch. Không yêu cầu X-Branch-Id vì phạm vi được truyền bằng fromBranchId/toBranchId.',
  })
  @ApiBody({ type: TransferStaffBranchDto })
  @ApiBaseResponse(ManagedUserResponseDto, {
    status: 201,
    description: 'Chuyển chi nhánh Staff thành công',
  })
  @ApiResponse({
    status: 400,
    description: 'Dữ liệu chi nhánh hoặc role không hợp lệ',
    schema: { $ref: '#/components/schemas/ErrorResponseDto' },
  })
  @ApiResponse({
    status: 401,
    description: 'Thiếu hoặc sai cookie xác thực',
    schema: { $ref: '#/components/schemas/ErrorResponseDto' },
  })
  @ApiResponse({
    status: 403,
    description: 'Chỉ Super Admin được chuyển chi nhánh Staff',
    schema: { $ref: '#/components/schemas/ErrorResponseDto' },
  })
  @ApiResponse({
    status: 404,
    description: 'Không tìm thấy assignment nguồn active',
    schema: { $ref: '#/components/schemas/ErrorResponseDto' },
  })
  @ApiResponse({
    status: 409,
    description: 'Assignment chi nhánh đích đã active',
    schema: { $ref: '#/components/schemas/ErrorResponseDto' },
  })
  transferBranch(
    @CurrentUser() actor: AuthenticatedUser,
    @UlidParam() id: string,
    @Body() dto: TransferStaffBranchDto,
  ) {
    return this.service.transferStaffBranch(actor, id, dto);
  }
  @Patch(':id')
  @Permissions('staff.update')
  @BranchScope(BranchScopeMode.REQUIRED_SELECTION)
  @ApiHeader({ name: 'X-Branch-Id', required: true })
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Update staff' })
  @ApiBaseResponse(ManagedUserResponseDto, { description: 'Staff updated' })
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentBranchContext() context: BranchContext,
    @UlidParam() id: string,
    @Body() dto: UpdateStaffDto,
  ) {
    return this.service.updateStaff(actor, context, id, dto);
  }
  @Delete(':id')
  @Permissions('staff.delete')
  @BranchScope(BranchScopeMode.REQUIRED_SELECTION)
  @ApiHeader({ name: 'X-Branch-Id', required: true })
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Deactivate staff employment in selected branch' })
  @ApiBaseResponse(ManagedUserResponseDto, { description: 'Staff offboarded' })
  disable(
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentBranchContext() context: BranchContext,
    @UlidParam() id: string,
  ) {
    return this.service.disableStaff(actor, context, id);
  }
  @Post(':id/roles/:roleId')
  @Permissions('staff.assign_role')
  @BranchScope(BranchScopeMode.REQUIRED_SELECTION)
  @ApiHeader({ name: 'X-Branch-Id', required: true })
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Assign role to staff' })
  @ApiBaseResponse(UserBranchRoleResponseDto, {
    status: 201,
    description: 'Role assigned',
  })
  assignRole(
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentBranchContext() context: BranchContext,
    @UlidParam() id: string,
    @UlidParam('roleId') roleId: string,
  ) {
    return this.service.assignUserRole(actor, context, id, roleId);
  }
  @Delete(':id/roles/:roleId')
  @Permissions('staff.assign_role')
  @BranchScope(BranchScopeMode.REQUIRED_SELECTION)
  @ApiHeader({ name: 'X-Branch-Id', required: true })
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Remove role from staff' })
  @ApiBaseResponse(MutationCountResponseDto, {
    description: 'Role removed',
  })
  removeRole(
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentBranchContext() context: BranchContext,
    @UlidParam() id: string,
    @UlidParam('roleId') roleId: string,
  ) {
    return this.service.removeUserRole(actor, context, id, roleId);
  }
  @Put(':id/permissions/:permissionId')
  @Permissions('staff.assign_permission')
  @BranchScope(BranchScopeMode.REQUIRED_SELECTION)
  @ApiHeader({ name: 'X-Branch-Id', required: true })
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Create or update staff permission override' })
  @ApiBaseResponse(UserBranchPermissionResponseDto, {
    description: 'Permission override saved',
  })
  permission(
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentBranchContext() context: BranchContext,
    @UlidParam() id: string,
    @UlidParam('permissionId') permissionId: string,
    @Body() dto: UpsertUserPermissionDto,
  ) {
    return this.service.upsertUserPermission(
      actor,
      context,
      id,
      permissionId,
      dto.effect,
    );
  }
  @Delete(':id/permissions/:permissionId')
  @Permissions('staff.assign_permission')
  @BranchScope(BranchScopeMode.REQUIRED_SELECTION)
  @ApiHeader({ name: 'X-Branch-Id', required: true })
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Remove staff permission override' })
  @ApiBaseResponse(MutationCountResponseDto, {
    description: 'Permission override removed',
  })
  removePermission(
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentBranchContext() context: BranchContext,
    @UlidParam() id: string,
    @UlidParam('permissionId') permissionId: string,
  ) {
    return this.service.removeUserPermission(actor, context, id, permissionId);
  }
  @Post(':id/branches/:branchId')
  @Permissions('staff.assign_branch')
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Assign branch to staff' })
  @ApiBaseResponse(UserBranchCreateResponseDto, {
    status: 201,
    description: 'Branch assigned',
  })
  assignBranch(
    @CurrentUser() actor: AuthenticatedUser,
    @UlidParam() id: string,
    @UlidParam('branchId') branchId: string,
  ) {
    return this.service.assignUserBranch(actor, id, branchId, 'STAFF');
  }
  @Patch(':id/branches/:branchId/activate')
  @Permissions('staff.assign_branch')
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Activate staff branch assignment' })
  @ApiBaseResponse(UserBranchStateResponseDto, {
    description: 'Branch assignment activated',
  })
  activateBranch(
    @CurrentUser() actor: AuthenticatedUser,
    @UlidParam() id: string,
    @UlidParam('branchId') branchId: string,
  ) {
    return this.service.setUserBranchActive(actor, id, branchId, true);
  }
  @Patch(':id/branches/:branchId/deactivate')
  @Permissions('staff.assign_branch')
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Deactivate staff branch assignment' })
  @ApiBaseResponse(UserBranchStateResponseDto, {
    description: 'Branch assignment deactivated',
  })
  deactivateBranch(
    @CurrentUser() actor: AuthenticatedUser,
    @UlidParam() id: string,
    @UlidParam('branchId') branchId: string,
    @Body() dto: ChangePrimaryBranchDto,
  ) {
    return this.service.setUserBranchActive(
      actor,
      id,
      branchId,
      false,
      dto.replacementBranchId,
    );
  }
  @Delete(':id/branches/:branchId')
  @Permissions('staff.assign_branch')
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Remove staff branch assignment' })
  @ApiBaseResponse(MutationCountResponseDto, {
    description: 'Branch assignment removed',
  })
  removeBranch(
    @CurrentUser() actor: AuthenticatedUser,
    @UlidParam() id: string,
    @UlidParam('branchId') branchId: string,
    @Body() dto: ChangePrimaryBranchDto,
  ) {
    return this.service.removeUserBranch(
      actor,
      id,
      branchId,
      dto.replacementBranchId,
    );
  }
  @Patch(':id/branches/:branchId/primary')
  @Permissions('staff.assign_branch')
  @ApiSecurity('csrf')
  @ApiOperation({ summary: 'Set staff primary branch' })
  @ApiBaseResponse(UserBranchStateResponseDto, {
    description: 'Primary branch changed',
  })
  primary(
    @CurrentUser() actor: AuthenticatedUser,
    @UlidParam() id: string,
    @UlidParam('branchId') branchId: string,
  ) {
    return this.service.setPrimaryUserBranch(actor, id, branchId);
  }
}
