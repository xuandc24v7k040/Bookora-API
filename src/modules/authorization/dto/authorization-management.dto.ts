import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  ArrayUnique,
  IsBoolean,
  IsDateString,
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateNested,
  ValidationArguments,
  registerDecorator,
} from 'class-validator';
import { PermissionEffect, UserType } from '@/generated/prisma/client';
import { PaginationDto } from '@/common/dto';
import { SortDirection } from '@/common/enums';

export const ULID_PATTERN = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
export const PERMISSION_CODE_PATTERN = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;
const ROLE_CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type BranchCoordinates = {
  latitude?: number | null;
  longitude?: number | null;
};

function BranchCoordinatesAreValid(): ClassDecorator {
  return (target) => {
    registerDecorator({
      name: 'branchCoordinatesAreValid',
      target,
      propertyName: 'coordinates',
      validator: {
        validate(_value: unknown, args: ValidationArguments): boolean {
          const { latitude, longitude } = args.object as BranchCoordinates;
          const hasLatitude = latitude !== undefined && latitude !== null;
          const hasLongitude = longitude !== undefined && longitude !== null;
          if (hasLatitude !== hasLongitude) return false;
          return !(latitude === 0 && longitude === 0);
        },
        defaultMessage(args: ValidationArguments): string {
          const { latitude, longitude } = args.object as BranchCoordinates;
          const hasLatitude = latitude !== undefined && latitude !== null;
          const hasLongitude = longitude !== undefined && longitude !== null;
          return hasLatitude !== hasLongitude
            ? 'Vui lòng nhập đầy đủ vĩ độ và kinh độ.'
            : 'Tọa độ 0, 0 không phải vị trí hợp lệ của chi nhánh tại Việt Nam.';
        },
      },
    });
  };
}

type BranchDateRange = {
  createdFrom?: string;
  createdTo?: string;
};

type BranchAdminAssignmentFilters = {
  assignedBranchId?: string;
  excludeAssignedBranchId?: string;
  assignmentIsActive?: boolean;
  assignmentState?: BranchAdminAssignmentState;
};

function BranchAdminAssignmentFiltersAreValid(): ClassDecorator {
  return (target) => {
    registerDecorator({
      name: 'branchAdminAssignmentFiltersAreValid',
      target,
      propertyName: 'assignmentFilters',
      validator: {
        validate(_value: unknown, args: ValidationArguments): boolean {
          const filters = args.object as BranchAdminAssignmentFilters;
          if (filters.assignedBranchId && filters.excludeAssignedBranchId) {
            return false;
          }
          if (
            filters.assignmentState !== undefined &&
            filters.assignmentIsActive !== undefined
          ) {
            return false;
          }
          return (
            filters.assignmentIsActive === undefined ||
            Boolean(filters.assignedBranchId)
          );
        },
        defaultMessage: () => 'Bộ lọc phân công chi nhánh không hợp lệ.',
      },
    });
  };
}

function BranchDateRangeIsValid(): ClassDecorator {
  return (target) => {
    registerDecorator({
      name: 'branchDateRangeIsValid',
      target,
      propertyName: 'createdRange',
      validator: {
        validate(_value: unknown, args: ValidationArguments): boolean {
          const { createdFrom, createdTo } = args.object as BranchDateRange;
          return !createdFrom || !createdTo || createdFrom <= createdTo;
        },
        defaultMessage: () =>
          'Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc.',
      },
    });
  };
}

type RoleQueryRanges = BranchDateRange & {
  levelFrom?: number;
  levelTo?: number;
};

function RoleQueryRangesAreValid(): ClassDecorator {
  return (target) => {
    registerDecorator({
      name: 'roleLevelRangeIsValid',
      target,
      propertyName: 'levelRange',
      validator: {
        validate(_value: unknown, args: ValidationArguments): boolean {
          const { levelFrom, levelTo } = args.object as RoleQueryRanges;
          return (
            levelFrom === undefined ||
            levelTo === undefined ||
            levelFrom <= levelTo
          );
        },
        defaultMessage: () =>
          'Cấp độ bắt đầu phải nhỏ hơn hoặc bằng cấp độ kết thúc.',
      },
    });
    registerDecorator({
      name: 'roleCreatedRangeIsValid',
      target,
      propertyName: 'createdRange',
      validator: {
        validate(_value: unknown, args: ValidationArguments): boolean {
          const { createdFrom, createdTo } = args.object as RoleQueryRanges;
          return !createdFrom || !createdTo || createdFrom <= createdTo;
        },
        defaultMessage: () =>
          'Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc.',
      },
    });
  };
}

export class CatalogQueryDto extends PaginationDto {
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
}

export enum StaffSortField {
  FULL_NAME = 'fullName',
  EMAIL = 'email',
  PHONE = 'phone',
  USER_IS_ACTIVE = 'userIsActive',
  ASSIGNMENT_IS_ACTIVE = 'assignmentIsActive',
  IS_PRIMARY = 'isPrimary',
  ASSIGNED_AT = 'assignedAt',
  CREATED_AT = 'createdAt',
}

export class StaffListQueryDto extends CatalogQueryDto {
  @ApiPropertyOptional({ enum: StaffSortField })
  @IsOptional()
  @IsEnum(StaffSortField)
  sortBy: StaffSortField = StaffSortField.ASSIGNED_AT;

  @ApiPropertyOptional({ enum: SortDirection })
  @IsOptional()
  @IsEnum(SortDirection)
  sortOrder: SortDirection = SortDirection.DESC;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  userIsActive?: boolean;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  assignmentIsActive?: boolean;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  isPrimary?: boolean;

  @ApiPropertyOptional({ type: String, format: 'ulid' })
  @IsOptional()
  @Matches(ULID_PATTERN)
  roleId?: string;
}

export class StaffCandidateListQueryDto extends CatalogQueryDto {}

export enum BranchAdminAssignmentState {
  UNASSIGNED = 'UNASSIGNED',
  ACTIVE = 'ACTIVE',
  INACTIVE_ONLY = 'INACTIVE_ONLY',
}

export enum BranchAdminSortField {
  FULL_NAME = 'fullName',
  EMAIL = 'email',
  PHONE = 'phone',
  IS_ACTIVE = 'isActive',
  PRIMARY_BRANCH = 'primaryBranch',
  ASSIGNMENTS = 'assignments',
  CREATED_AT = 'createdAt',
}

@BranchAdminAssignmentFiltersAreValid()
export class BranchAdminListQueryDto extends CatalogQueryDto {
  @ApiPropertyOptional({ type: String, format: 'ulid' })
  @IsOptional()
  @Matches(ULID_PATTERN)
  assignedBranchId?: string;

  @ApiPropertyOptional({ type: String, format: 'ulid' })
  @IsOptional()
  @Matches(ULID_PATTERN)
  excludeAssignedBranchId?: string;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  assignmentIsActive?: boolean;

  @ApiPropertyOptional({ enum: BranchAdminAssignmentState })
  @IsOptional()
  @IsEnum(BranchAdminAssignmentState)
  assignmentState?: BranchAdminAssignmentState;

  @ApiPropertyOptional({
    enum: BranchAdminSortField,
    default: BranchAdminSortField.CREATED_AT,
  })
  @IsOptional()
  @IsEnum(BranchAdminSortField)
  sortBy?: BranchAdminSortField;

  @ApiPropertyOptional({ enum: SortDirection, default: SortDirection.DESC })
  @IsOptional()
  @IsEnum(SortDirection)
  sortOrder?: SortDirection;
}

export enum PermissionSortField {
  CODE = 'code',
  NAME = 'name',
  RESOURCE = 'resource',
  ACTION = 'action',
  GUARD_NAME = 'guardName',
  DESCRIPTION = 'description',
  CREATED_AT = 'createdAt',
  UPDATED_AT = 'updatedAt',
}

@BranchDateRangeIsValid()
export class PermissionListQueryDto extends CatalogQueryDto {
  @ApiPropertyOptional({ example: 'roles' })
  @IsOptional()
  @Matches(/^[a-z][a-z0-9_]*$/)
  resource?: string;

  @ApiPropertyOptional({ example: 'read' })
  @IsOptional()
  @Matches(/^[a-z][a-z0-9_]*$/)
  action?: string;

  @ApiPropertyOptional({ example: 'web' })
  @IsOptional()
  @Matches(/^web$/)
  guardName?: string;

  @ApiPropertyOptional({ type: String, format: 'date' })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(DATE_ONLY_PATTERN)
  createdFrom?: string;

  @ApiPropertyOptional({ type: String, format: 'date' })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(DATE_ONLY_PATTERN)
  createdTo?: string;

  @ApiPropertyOptional({
    enum: PermissionSortField,
    default: PermissionSortField.CREATED_AT,
  })
  @IsOptional()
  @IsEnum(PermissionSortField)
  sortBy?: PermissionSortField;

  @ApiPropertyOptional({ enum: SortDirection, default: SortDirection.DESC })
  @IsOptional()
  @IsEnum(SortDirection)
  sortOrder?: SortDirection;
}

export enum RoleSortField {
  CODE = 'code',
  NAME = 'name',
  DESCRIPTION = 'description',
  TYPE = 'type',
  GUARD_NAME = 'guardName',
  LEVEL = 'level',
  IS_SYSTEM = 'isSystem',
  IS_ACTIVE = 'isActive',
  CREATED_AT = 'createdAt',
  UPDATED_AT = 'updatedAt',
}

@RoleQueryRangesAreValid()
export class RoleListQueryDto extends CatalogQueryDto {
  @ApiPropertyOptional({ enum: UserType })
  @IsOptional()
  @IsEnum(UserType)
  type?: UserType;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  isSystem?: boolean;

  @ApiPropertyOptional({ example: 'web' })
  @IsOptional()
  @Matches(/^web$/)
  guardName?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 99 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  levelFrom?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 99 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  levelTo?: number;

  @ApiPropertyOptional({ type: String, format: 'date' })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(DATE_ONLY_PATTERN)
  createdFrom?: string;

  @ApiPropertyOptional({ type: String, format: 'date' })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(DATE_ONLY_PATTERN)
  createdTo?: string;

  @ApiPropertyOptional({
    enum: RoleSortField,
    default: RoleSortField.CREATED_AT,
  })
  @IsOptional()
  @IsEnum(RoleSortField)
  sortBy?: RoleSortField;

  @ApiPropertyOptional({ enum: SortDirection, default: SortDirection.DESC })
  @IsOptional()
  @IsEnum(SortDirection)
  sortOrder?: SortDirection;
}

export enum StaffAssignableRoleAction {
  CREATE = 'CREATE',
  ASSIGN = 'ASSIGN',
}

export class StaffAssignableRoleListQueryDto extends CatalogQueryDto {
  @ApiProperty({ enum: StaffAssignableRoleAction })
  @IsEnum(StaffAssignableRoleAction)
  action!: StaffAssignableRoleAction;
}

export class StaffAssignablePermissionListQueryDto extends CatalogQueryDto {}

export enum BranchSortField {
  CODE = 'code',
  NAME = 'name',
  IS_ACTIVE = 'isActive',
  CREATED_AT = 'createdAt',
  UPDATED_AT = 'updatedAt',
}

@BranchDateRangeIsValid()
export class BranchListQueryDto extends CatalogQueryDto {
  @ApiPropertyOptional({ type: Boolean, example: true })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ enum: BranchSortField })
  @IsOptional()
  @IsEnum(BranchSortField)
  sortBy?: BranchSortField;

  @ApiPropertyOptional({ enum: SortDirection })
  @IsOptional()
  @IsEnum(SortDirection)
  sortOrder?: SortDirection;

  @ApiPropertyOptional({
    type: String,
    format: 'date',
    example: '2026-06-01',
    description: 'Ngày tạo bắt đầu, inclusive theo múi giờ Việt Nam.',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(DATE_ONLY_PATTERN)
  createdFrom?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'date',
    example: '2026-06-30',
    description: 'Ngày tạo kết thúc, inclusive theo múi giờ Việt Nam.',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(DATE_ONLY_PATTERN)
  createdTo?: string;
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
  @ApiPropertyOptional({ nullable: true, type: String })
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
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Matches(PERMISSION_CODE_PATTERN)
  code!: string;
  @ApiProperty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  name!: string;
  @ApiProperty({ example: 'orders' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Matches(/^[a-z][a-z0-9_]*$/)
  resource!: string;
  @ApiProperty({ example: 'read' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Matches(/^[a-z][a-z0-9_]*$/)
  action!: string;
  @ApiPropertyOptional({ default: 'web' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Matches(/^web$/)
  guardName?: string;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  description?: string | null;
}

export class UpdatePermissionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Matches(PERMISSION_CODE_PATTERN)
  code?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  name?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Matches(/^[a-z][a-z0-9_]*$/)
  resource?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Matches(/^[a-z][a-z0-9_]*$/)
  action?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Matches(/^web$/)
  guardName?: string;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  description?: string | null;
}

@BranchCoordinatesAreValid()
export class CreateBranchDto {
  @ApiProperty() @IsString() name!: string;
  @ApiProperty({ example: 'can-tho' })
  @Matches(/^[a-z][a-z0-9-]*$/)
  code!: string;
  @ApiProperty() @IsString() address!: string;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  phone?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  province?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  ward?: string | null;
  @ApiPropertyOptional({
    type: Number,
    format: 'double',
    minimum: -90,
    maximum: 90,
    nullable: true,
    example: 10.0452,
  })
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  latitude?: number | null;
  @ApiPropertyOptional({
    type: Number,
    format: 'double',
    minimum: -180,
    maximum: 180,
    nullable: true,
    example: 105.7469,
  })
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  longitude?: number | null;

  @ApiPropertyOptional({
    type: Boolean,
    default: true,
    description: 'true = Đang hoạt động, false = Ngừng hoạt động.',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

@BranchCoordinatesAreValid()
export class UpdateBranchDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^[a-z][a-z0-9-]*$/)
  code?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  phone?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  province?: string | null;
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  ward?: string | null;
  @ApiPropertyOptional({
    type: Number,
    format: 'double',
    minimum: -90,
    maximum: 90,
    nullable: true,
  })
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  latitude?: number | null;
  @ApiPropertyOptional({
    type: Number,
    format: 'double',
    minimum: -180,
    maximum: 180,
    nullable: true,
  })
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  longitude?: number | null;

  @ApiPropertyOptional({
    type: Boolean,
    description: 'true = Đang hoạt động, false = Ngừng hoạt động.',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
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
  @ApiProperty({
    description:
      'Mỗi branchId chỉ được xuất hiện một lần trong toàn bộ payload.',
  })
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

  @ApiPropertyOptional({
    type: [ConvertStaffPermissionDto],
    description:
      'permissionId phải unique trong assignment; dangerous permissions bị backend từ chối cho cả ALLOW và DENY.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConvertStaffPermissionDto)
  permissions?: ConvertStaffPermissionDto[];
}

export class ConvertStaffDto {
  @ApiProperty({
    type: [ConvertStaffBranchAssignmentDto],
    description:
      'Danh sách branch phải unique và phải có đúng một assignment isPrimary=true. OpenAPI không biểu diễn đầy đủ cross-field invariant này; client vẫn phải validate bổ sung.',
  })
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

export class AssignExistingStaffDto {
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
  @ApiProperty({ nullable: true, type: String }) phone!: string | null;
  @ApiProperty({ nullable: true, type: String }) province!: string | null;
  @ApiProperty({ nullable: true, type: String }) ward!: string | null;
  @ApiProperty({
    type: Number,
    format: 'double',
    minimum: -90,
    maximum: 90,
    nullable: true,
  })
  latitude!: number | null;
  @ApiProperty({
    type: Number,
    format: 'double',
    minimum: -180,
    maximum: 180,
    nullable: true,
  })
  longitude!: number | null;
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

export class ManagedUserBranchSummaryResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() address!: string;
  @ApiProperty({ nullable: true, type: String }) phone!: string | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

export class ManagedUserBranchResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() branchId!: string;
  @ApiProperty() isPrimary!: boolean;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ type: ManagedUserBranchSummaryResponseDto })
  branch!: ManagedUserBranchSummaryResponseDto;
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

export class RoleDetailResponseDto extends RoleResponseDto {
  @ApiProperty({ type: [RolePermissionResponseDto] })
  rolePermissions!: RolePermissionResponseDto[];
}

export class PermissionUsageCountResponseDto {
  @ApiProperty() rolePermissions!: number;
  @ApiProperty() userPermissions!: number;
  @ApiProperty() userBranchPermissions!: number;
}

export class PermissionDetailResponseDto extends PermissionResponseDto {
  @ApiProperty({ type: PermissionUsageCountResponseDto })
  _count!: PermissionUsageCountResponseDto;
}

export class UserBranchCreateResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() userId!: string;
  @ApiProperty() branchId!: string;
  @ApiProperty() isPrimary!: boolean;
  @ApiProperty() isActive!: boolean;
}

export class UserBranchStateResponseDto extends UserBranchCreateResponseDto {
  @ApiProperty({ nullable: true, type: String })
  assignedBy!: string | null;
  @ApiProperty({ format: 'date-time' }) assignedAt!: string;
}

export class UserBranchRoleResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() userBranchId!: string;
  @ApiProperty() roleId!: string;
  @ApiProperty({ nullable: true, type: String })
  assignedBy!: string | null;
  @ApiProperty({ format: 'date-time' }) assignedAt!: string;
}

export class UserBranchPermissionResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() userBranchId!: string;
  @ApiProperty() permissionId!: string;
  @ApiProperty({ enum: PermissionEffect }) effect!: PermissionEffect;
  @ApiProperty({ nullable: true, type: String })
  assignedBy!: string | null;
  @ApiProperty({ format: 'date-time' }) assignedAt!: string;
}

export class StaffAssignmentsUserResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ nullable: true, type: String }) fullName!: string | null;
  @ApiProperty({ nullable: true, type: String }) phone!: string | null;
  @ApiProperty({ nullable: true, type: String }) gender!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date' })
  birthday!: string | null;
  @ApiProperty({ enum: UserType }) type!: UserType;
  @ApiProperty() isActive!: boolean;
}

export class StaffAssignmentBranchResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() isActive!: boolean;
}

export class StaffAssignmentRolePermissionResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() resource!: string;
  @ApiProperty() action!: string;
  @ApiProperty() guardName!: string;
}

export class StaffAssignmentRolePermissionMappingResponseDto {
  @ApiProperty({ type: StaffAssignmentRolePermissionResponseDto })
  permission!: StaffAssignmentRolePermissionResponseDto;
}

export class StaffAssignmentRoleResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() level!: number;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() isSystem!: boolean;
  @ApiProperty({ enum: UserType }) type!: UserType;
  @ApiProperty() guardName!: string;
  @ApiProperty({ type: [StaffAssignmentRolePermissionMappingResponseDto] })
  rolePermissions!: StaffAssignmentRolePermissionMappingResponseDto[];
}

export class StaffAssignmentRoleMappingResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ type: StaffAssignmentRoleResponseDto })
  role!: StaffAssignmentRoleResponseDto;
}

export class StaffAssignmentPermissionResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() resource!: string;
  @ApiProperty() action!: string;
  @ApiProperty() guardName!: string;
}

export class StaffAssignmentPermissionMappingResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: PermissionEffect }) effect!: PermissionEffect;
  @ApiProperty({ type: StaffAssignmentPermissionResponseDto })
  permission!: StaffAssignmentPermissionResponseDto;
}

export class StaffBranchAssignmentResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() branchId!: string;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() isPrimary!: boolean;
  @ApiProperty({ format: 'date-time' }) assignedAt!: string;
  @ApiProperty({ nullable: true, type: String })
  assignedBy!: string | null;
  @ApiProperty({ type: StaffAssignmentBranchResponseDto })
  branch!: StaffAssignmentBranchResponseDto;
  @ApiProperty({ type: [StaffAssignmentRoleMappingResponseDto] })
  roles!: StaffAssignmentRoleMappingResponseDto[];
  @ApiProperty({ type: [StaffAssignmentPermissionMappingResponseDto] })
  permissions!: StaffAssignmentPermissionMappingResponseDto[];
}

export class StaffAssignmentsResponseDto {
  @ApiProperty({ type: StaffAssignmentsUserResponseDto })
  user!: StaffAssignmentsUserResponseDto;
  @ApiProperty({ type: [StaffBranchAssignmentResponseDto] })
  assignments!: StaffBranchAssignmentResponseDto[];
}

export class StaffSelectedAssignmentResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() branchId!: string;
  @ApiProperty() isPrimary!: boolean;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ nullable: true, type: String }) assignedBy!: string | null;
  @ApiProperty({ format: 'date-time' }) assignedAt!: string;
  @ApiProperty({ type: StaffAssignmentBranchResponseDto })
  branch!: StaffAssignmentBranchResponseDto;
  @ApiProperty({ type: [StaffAssignmentRoleResponseDto] })
  roles!: StaffAssignmentRoleResponseDto[];
  @ApiProperty({ type: [StaffAssignmentPermissionMappingResponseDto] })
  permissions!: StaffAssignmentPermissionMappingResponseDto[];
}

export class StaffResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ nullable: true, type: String }) fullName!: string | null;
  @ApiProperty({ nullable: true, type: String }) phone!: string | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: StaffSelectedAssignmentResponseDto })
  assignment!: StaffSelectedAssignmentResponseDto;
}

export class StaffCandidateResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ nullable: true, type: String }) fullName!: string | null;
  @ApiProperty({ nullable: true, type: String }) phone!: string | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() assignmentCount!: number;
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
