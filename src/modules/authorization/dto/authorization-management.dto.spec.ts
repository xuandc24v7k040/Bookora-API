import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  BranchAdminListQueryDto,
  BranchAdminAssignmentState,
  BranchAdminSortField,
  ConvertBranchAdminDto,
  CreatePermissionDto,
  CreateStaffDto,
  AssignExistingStaffDto,
  StaffListQueryDto,
  UpdatePermissionDto,
} from './authorization-management.dto';

describe('Authorization management DTOs', () => {
  it('validates Branch Admin assignment filters and boolean query values', async () => {
    const valid = plainToInstance(BranchAdminListQueryDto, {
      assignedBranchId: '01JZ0000000000000000000001',
      isActive: 'true',
      assignmentIsActive: 'false',
    });
    await expect(validate(valid)).resolves.toHaveLength(0);
    expect(valid).toMatchObject({
      isActive: true,
      assignmentIsActive: false,
    });
    const aggregate = plainToInstance(BranchAdminListQueryDto, {
      assignmentState: BranchAdminAssignmentState.INACTIVE_ONLY,
      sortBy: BranchAdminSortField.PRIMARY_BRANCH,
      sortOrder: 'asc',
    });
    await expect(validate(aggregate)).resolves.toHaveLength(0);

    const mutuallyExclusive = plainToInstance(BranchAdminListQueryDto, {
      assignedBranchId: '01JZ0000000000000000000001',
      excludeAssignedBranchId: '01JZ0000000000000000000002',
    });
    const missingAssignedFilter = plainToInstance(BranchAdminListQueryDto, {
      assignmentIsActive: true,
    });

    await expect(validate(mutuallyExclusive)).resolves.not.toHaveLength(0);
    await expect(validate(missingAssignedFilter)).resolves.not.toHaveLength(0);

    const conflictingState = plainToInstance(BranchAdminListQueryDto, {
      assignedBranchId: '01JZ0000000000000000000001',
      assignmentIsActive: true,
      assignmentState: BranchAdminAssignmentState.ACTIVE,
    });
    const unassignedAtBranch = plainToInstance(BranchAdminListQueryDto, {
      assignedBranchId: '01JZ0000000000000000000001',
      assignmentState: BranchAdminAssignmentState.UNASSIGNED,
    });
    await expect(validate(conflictingState)).resolves.not.toHaveLength(0);
    await expect(validate(unassignedAtBranch)).resolves.toHaveLength(0);
  });

  it('requires at least one unique branch when converting Branch Admin', async () => {
    const empty = await validate(
      plainToInstance(ConvertBranchAdminDto, { branchIds: [] }),
    );
    const duplicate = await validate(
      plainToInstance(ConvertBranchAdminDto, {
        branchIds: ['01JZ0000000000000000000001', '01JZ0000000000000000000001'],
      }),
    );

    expect(empty).not.toHaveLength(0);
    expect(duplicate).not.toHaveLength(0);
  });

  it('validates staff password and requires at least one role', async () => {
    const errors = await validate(
      plainToInstance(CreateStaffDto, {
        email: 'staff@example.com',
        fullName: 'Staff',
        password: 12345678,
        roleIds: [],
      }),
    );

    expect(errors.map(({ property }) => property)).toEqual(
      expect.arrayContaining(['password', 'roleIds']),
    );
  });

  it('validates Staff list filters and atomic add-existing payload', async () => {
    const query = plainToInstance(StaffListQueryDto, {
      userIsActive: 'true',
      assignmentIsActive: 'false',
      isPrimary: 'true',
      roleId: '01JZ0000000000000000000001',
      sortBy: 'assignedAt',
      sortOrder: 'asc',
    });
    await expect(validate(query)).resolves.toHaveLength(0);
    expect(query).toMatchObject({
      userIsActive: true,
      assignmentIsActive: false,
      isPrimary: true,
    });

    const emptyRoles = plainToInstance(AssignExistingStaffDto, {
      roleIds: [],
    });
    const duplicateRoles = plainToInstance(AssignExistingStaffDto, {
      roleIds: ['01JZ0000000000000000000001', '01JZ0000000000000000000001'],
    });
    await expect(validate(emptyRoles)).resolves.not.toHaveLength(0);
    await expect(validate(duplicateRoles)).resolves.not.toHaveLength(0);
  });

  it('uses the exact resource.action permission code convention', async () => {
    const errors = await validate(
      plainToInstance(CreatePermissionDto, {
        code: 'ordersXread',
        name: 'Invalid',
        resource: 'orders',
        action: 'read',
      }),
    );

    expect(errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'code' })]),
    );
  });

  it('trims permission fields and rejects an empty permission name', async () => {
    const dto = plainToInstance(CreatePermissionDto, {
      code: '  shipments.read  ',
      name: '  Xem vận chuyển  ',
      resource: '  shipments  ',
      action: '  read  ',
      guardName: '  web  ',
      description: '  Mô tả  ',
    });
    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toMatchObject({
      code: 'shipments.read',
      name: 'Xem vận chuyển',
      resource: 'shipments',
      action: 'read',
      guardName: 'web',
      description: 'Mô tả',
    });

    const invalid = plainToInstance(CreatePermissionDto, {
      code: 'shipments.read',
      name: '  ',
      resource: 'shipments',
      action: 'read',
    });
    const errors = await validate(invalid);
    expect(errors.some((error) => error.property === 'name')).toBe(true);
  });

  it('accepts null permission descriptions for create and partial update', async () => {
    const create = plainToInstance(CreatePermissionDto, {
      code: 'shipments.read',
      name: 'Xem vận chuyển',
      resource: 'shipments',
      action: 'read',
      description: null,
    });
    const update = plainToInstance(UpdatePermissionDto, {
      description: null,
    });

    await expect(validate(create)).resolves.toHaveLength(0);
    await expect(validate(update)).resolves.toHaveLength(0);
  });
});
