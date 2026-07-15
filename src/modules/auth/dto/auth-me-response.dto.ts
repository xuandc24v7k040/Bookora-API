import { ApiProperty } from '@nestjs/swagger';
import { UserType } from '@/generated/prisma/client';

export class AuthMeRoleDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() level!: number;
  @ApiProperty({ enum: UserType }) type!: UserType;
  @ApiProperty() isSystem!: boolean;
}

export class AuthMeBranchDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() isPrimary!: boolean;
}

export class AuthMeBranchAssignmentDto {
  @ApiProperty() branchId!: string;
  @ApiProperty() userBranchId!: string;
  @ApiProperty({ type: AuthMeBranchDto }) branch!: AuthMeBranchDto;
  @ApiProperty() isPrimary!: boolean;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ type: [AuthMeRoleDto] }) roles!: AuthMeRoleDto[];
  @ApiProperty({ type: [String] }) permissions!: string[];
  @ApiProperty() maxRoleLevel!: number;
}

export class AuthMeResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty({
    type: String,
    nullable: true,
    example: '0901234567',
    description: 'Số điện thoại hồ sơ, null nếu chưa cập nhật.',
  })
  phone!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    example: 'female',
    description: 'Giới tính dạng chuỗi hồ sơ, null nếu chưa cập nhật.',
  })
  gender!: string | null;
  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    example: '1995-06-15',
    description: 'Ngày sinh theo lịch, định dạng YYYY-MM-DD.',
  })
  birthday!: string | null;
  @ApiProperty({ enum: UserType }) type!: UserType;
  @ApiProperty({
    type: [AuthMeRoleDto],
    description:
      'Legacy request-effective roles. Empty for BRANCH users until a branch-scoped request resolves X-Branch-Id.',
  })
  roles!: AuthMeRoleDto[];
  @ApiProperty({
    type: [String],
    description:
      'Legacy request-effective permissions. Never contains a cross-branch union.',
  })
  permissions!: string[];
  @ApiProperty({ type: [AuthMeRoleDto] }) globalRoles!: AuthMeRoleDto[];
  @ApiProperty({ type: [String] }) globalPermissions!: string[];
  @ApiProperty({ type: [AuthMeBranchAssignmentDto] })
  branchAssignments!: AuthMeBranchAssignmentDto[];
  @ApiProperty() maxRoleLevel!: number;
  @ApiProperty() isSuperAdmin!: boolean;
  @ApiProperty({ type: [AuthMeBranchDto] }) branches!: AuthMeBranchDto[];
  @ApiProperty({ nullable: true, type: String })
  primaryBranchId!: string | null;
}
