import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UserType } from '@/generated/prisma/client';
import {
  RoleListQueryDto,
  RoleSortField,
} from './authorization-management.dto';

describe('RoleListQueryDto', () => {
  it('transforms booleans and numbers and accepts allowlisted sorting', async () => {
    const query = plainToInstance(RoleListQueryDto, {
      type: UserType.BRANCH,
      isActive: 'false',
      isSystem: 'true',
      levelFrom: '10',
      levelTo: '20',
      sortBy: RoleSortField.DESCRIPTION,
      sortOrder: 'asc',
    });

    await expect(validate(query)).resolves.toHaveLength(0);
    expect(query).toMatchObject({
      isActive: false,
      isSystem: true,
      levelFrom: 10,
      levelTo: 20,
    });
  });

  it.each([
    [{ type: 'UNKNOWN' }, 'type'],
    [{ isActive: '1' }, 'isActive'],
    [{ isSystem: '0' }, 'isSystem'],
    [{ guardName: 'api' }, 'guardName'],
    [{ levelFrom: '1.5' }, 'levelFrom'],
    [{ levelTo: '100' }, 'levelTo'],
    [{ sortBy: 'permissionCount' }, 'sortBy'],
    [{ sortOrder: 'up' }, 'sortOrder'],
    [{ createdFrom: '2026-02-31' }, 'createdFrom'],
  ])('rejects invalid query %o', async (value, property) => {
    const errors = await validate(plainToInstance(RoleListQueryDto, value));
    expect(errors.some((error) => error.property === property)).toBe(true);
  });

  it('rejects reversed level and date ranges', async () => {
    const errors = await validate(
      plainToInstance(RoleListQueryDto, {
        levelFrom: 20,
        levelTo: 10,
        createdFrom: '2026-07-02',
        createdTo: '2026-07-01',
      }),
    );

    expect(errors.map(({ property }) => property)).toEqual(
      expect.arrayContaining(['levelRange', 'createdRange']),
    );
  });
});
