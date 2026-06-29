import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  ArrayUnique,
  IsBoolean,
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PermissionEffect, UserType } from '@/generated/prisma/client';
import { PaginationDto } from '@/common/dto';

export const ULID_PATTERN = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
export const PERMISSION_CODE_PATTERN = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;
const ROLE_CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/;

export class CatalogQueryDto extends PaginationDto {
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
}

export class CreateRoleDto {
  @ApiProperty({ example: 'SALES_STAFF' })
  @Matches(ROLE_CODE_PATTERN)
  code!: string;
  @ApiProperty() @IsString() @MinLength(2) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty({ enum: UserType }) @IsEnum(UserType) type!: UserType;
  @ApiProperty({ minimum: 1, maximum: 99 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  level!: number;
  @ApiPropertyOptional({ default: 'web' })
  @IsOptional()
  @Matches(/^web$/)
  guardName?: string;
}

export class UpdateRoleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Matches(ROLE_CODE_PATTERN)
  code?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ enum: UserType })
  @IsOptional()
  @IsEnum(UserType)
  type?: UserType;
  @ApiPropertyOptional({ minimum: 1, maximum: 99 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  level?: number;
  @ApiPropertyOptional() @IsOptional() @Matches(/^web$/) guardName?: string;
}

export class CreatePermissionDto {
  @ApiProperty({ example: 'orders.read' })
  @Matches(PERMISSION_CODE_PATTERN)
  code!: string;
  @ApiProperty() @IsString() name!: string;
  @ApiProperty({ example: 'orders' })
  @Matches(/^[a-z][a-z0-9_]*$/)
  resource!: string;
  @ApiProperty({ example: 'read' })
  @Matches(/^[a-z][a-z0-9_]*$/)
  action!: string;
  @ApiPropertyOptional({ default: 'web' })
  @IsOptional()
  @Matches(/^web$/)
  guardName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
}

export class UpdatePermissionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Matches(PERMISSION_CODE_PATTERN)
  code?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^[a-z][a-z0-9_]*$/)
  resource?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^[a-z][a-z0-9_]*$/)
  action?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^web$/) guardName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
}

export class CreateBranchDto {
  @ApiProperty() @IsString() name!: string;
  @ApiProperty({ example: 'can-tho' })
  @Matches(/^[a-z][a-z0-9-]*$/)
  code!: string;
  @ApiProperty() @IsString() address!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
}

export class UpdateBranchDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^[a-z][a-z0-9-]*$/)
  code?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
}

export class CreateInternalUserDto {
  @ApiProperty() @IsEmail() email!: string;
  @ApiProperty() @IsString() fullName!: string;
  @ApiProperty({ minLength: 8 }) @IsString() @MinLength(8) password!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @Matches(ULID_PATTERN, { each: true })
  branchIds!: string[];
}

export class ConvertBranchAdminDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @Matches(ULID_PATTERN, { each: true })
  branchIds!: string[];
}

export class ConvertStaffPermissionDto {
  @ApiProperty()
  @Matches(ULID_PATTERN)
  permissionId!: string;

  @ApiProperty({ enum: PermissionEffect })
  @IsEnum(PermissionEffect)
  effect!: PermissionEffect;
}

export class ConvertStaffBranchAssignmentDto {
  @ApiProperty()
  @Matches(ULID_PATTERN)
  branchId!: string;

  @ApiProperty()
  @IsBoolean()
  isPrimary!: boolean;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @Matches(ULID_PATTERN, { each: true })
  roleIds!: string[];

  @ApiPropertyOptional({ type: [ConvertStaffPermissionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConvertStaffPermissionDto)
  permissions?: ConvertStaffPermissionDto[];
}

export class ConvertStaffDto {
  @ApiProperty({ type: [ConvertStaffBranchAssignmentDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ConvertStaffBranchAssignmentDto)
  branchAssignments!: ConvertStaffBranchAssignmentDto[];
}

export class CreateStaffDto {
  @ApiProperty() @IsEmail() email!: string;
  @ApiProperty() @IsString() fullName!: string;
  @ApiProperty({ minLength: 8 }) @IsString() @MinLength(8) password!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @Matches(ULID_PATTERN, { each: true })
  roleIds!: string[];
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @Matches(ULID_PATTERN, { each: true })
  permissionIds?: string[];
}

export class UpdateStaffDto {
  @ApiPropertyOptional() @IsOptional() @IsString() fullName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
}

export class TransferStaffBranchDto {
  @ApiProperty({
    type: String,
    format: 'ulid',
    minLength: 26,
    maxLength: 26,
    pattern: '^[0-7][0-9A-HJKMNP-TV-Z]{25}$',
    example: '01K10000000000000000000001',
    description:
      'ULID của chi nhánh nguồn đang active. Assignment này sẽ bị deactivate trong cùng transaction.',
  })
  @Matches(ULID_PATTERN)
  fromBranchId!: string;

  @ApiProperty({
    type: String,
    format: 'ulid',
    minLength: 26,
    maxLength: 26,
    pattern: '^[0-7][0-9A-HJKMNP-TV-Z]{25}$',
    example: '01K10000000000000000000002',
    description:
      'ULID của chi nhánh đích đang active. Assignment đích sẽ được tạo mới hoặc reactivate trong cùng transaction.',
  })
  @Matches(ULID_PATTERN)
  toBranchId!: string;

  @ApiProperty({
    type: 'array',
    minItems: 1,
    uniqueItems: true,
    items: {
      type: 'string',
      format: 'ulid',
      minLength: 26,
      maxLength: 26,
      pattern: '^[0-7][0-9A-HJKMNP-TV-Z]{25}$',
    },
    example: ['01K1000000000000000000000A'],
    description:
      'Danh sách ULID role STAFF active sẽ được gán rõ ràng tại chi nhánh đích. Không được rỗng, không được trùng; direct permission cũ tại assignment đích sẽ được xóa để tránh hồi sinh quyền cũ.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @Matches(ULID_PATTERN, { each: true })
  destinationRoleIds!: string[];
}

export class UpsertUserPermissionDto {
  @ApiProperty({ enum: PermissionEffect })
  @IsEnum(PermissionEffect)
  effect!: PermissionEffect;
}

export class ChangePrimaryBranchDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Matches(ULID_PATTERN)
  replacementBranchId?: string;
}

export class RoleResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() description?: string | null;
  @ApiProperty() guardName!: string;
  @ApiProperty({ enum: UserType }) type!: UserType;
  @ApiProperty() level!: number;
  @ApiProperty() isSystem!: boolean;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

export class PermissionResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() resource!: string;
  @ApiProperty() action!: string;
  @ApiProperty() guardName!: string;
  @ApiPropertyOptional() description?: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

export class BranchResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() address!: string;
  @ApiPropertyOptional() phone?: string | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

export class ManagedUserRoleResponseDto {
  @ApiProperty({ type: RoleResponseDto }) role!: RoleResponseDto;
}

export class ManagedUserPermissionResponseDto {
  @ApiProperty({ enum: PermissionEffect }) effect!: PermissionEffect;
  @ApiProperty({ type: PermissionResponseDto })
  permission!: PermissionResponseDto;
}

export class ManagedUserBranchResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() branchId!: string;
  @ApiProperty() isPrimary!: boolean;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ type: BranchResponseDto }) branch!: BranchResponseDto;
  @ApiProperty({ type: [ManagedUserRoleResponseDto] })
  roles!: ManagedUserRoleResponseDto[];
  @ApiProperty({ type: [ManagedUserPermissionResponseDto] })
  permissions!: ManagedUserPermissionResponseDto[];
}

export class ManagedUserResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() fullName!: string;
  @ApiPropertyOptional() phone?: string | null;
  @ApiProperty({ enum: UserType }) type!: UserType;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
  @ApiProperty({ type: [ManagedUserRoleResponseDto] })
  userRoles!: ManagedUserRoleResponseDto[];
  @ApiProperty({ type: [ManagedUserPermissionResponseDto] })
  userPermissions!: ManagedUserPermissionResponseDto[];
  @ApiProperty({ type: [ManagedUserBranchResponseDto] })
  userBranches!: ManagedUserBranchResponseDto[];
}

export class RolePermissionResponseDto {
  @ApiProperty({ type: PermissionResponseDto })
  permission!: PermissionResponseDto;
}

export class AssignmentResponseDto {
  @ApiProperty() userId!: string;
  @ApiPropertyOptional() roleId?: string;
  @ApiPropertyOptional() permissionId?: string;
  @ApiPropertyOptional() branchId?: string;
  @ApiPropertyOptional({ enum: PermissionEffect })
  effect?: PermissionEffect;
  @ApiPropertyOptional() isPrimary?: boolean;
  @ApiPropertyOptional() isActive?: boolean;
}

export class MutationCountResponseDto {
  @ApiProperty() count!: number;
}
