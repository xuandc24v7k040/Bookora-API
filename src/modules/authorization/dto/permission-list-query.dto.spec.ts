import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  PermissionListQueryDto,
  PermissionSortField,
} from './authorization-management.dto';

describe('PermissionListQueryDto', () => {
  it('accepts the complete allowlisted query contract', async () => {
    const query = plainToInstance(PermissionListQueryDto, {
      page: '2',
      limit: '25',
      search: 'roles',
      resource: 'roles',
      action: 'read',
      guardName: 'web',
      createdFrom: '2026-07-01',
      createdTo: '2026-07-02',
      sortBy: PermissionSortField.DESCRIPTION,
      sortOrder: 'asc',
    });

    await expect(validate(query)).resolves.toHaveLength(0);
  });

  it.each([
    [{ resource: 'Role Admin' }, 'resource'],
    [{ action: 'READ' }, 'action'],
    [{ guardName: 'api' }, 'guardName'],
    [{ sortBy: 'usageCount' }, 'sortBy'],
    [{ sortOrder: 'up' }, 'sortOrder'],
    [{ createdFrom: '2026-02-31' }, 'createdFrom'],
  ])('rejects invalid query %o', async (value, property) => {
    const errors = await validate(
      plainToInstance(PermissionListQueryDto, value),
    );
    expect(errors.some((error) => error.property === property)).toBe(true);
  });

  it('rejects a reversed date range', async () => {
    const errors = await validate(
      plainToInstance(PermissionListQueryDto, {
        createdFrom: '2026-07-02',
        createdTo: '2026-07-01',
      }),
    );

    expect(errors.some((error) => error.property === 'createdRange')).toBe(
      true,
    );
  });
});
