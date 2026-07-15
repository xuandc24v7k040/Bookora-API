import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  BranchListQueryDto,
  BranchSortField,
} from './authorization-management.dto';

describe('BranchListQueryDto', () => {
  it('transforms the active filter and accepts allowlisted sorting', async () => {
    const query = plainToInstance(BranchListQueryDto, {
      isActive: 'false',
      sortBy: BranchSortField.CREATED_AT,
      sortOrder: 'desc',
    });

    await expect(validate(query)).resolves.toHaveLength(0);
    expect(query.isActive).toBe(false);
  });

  it('rejects unsupported sort fields', async () => {
    const query = plainToInstance(BranchListQueryDto, { sortBy: 'phone' });

    const errors = await validate(query);
    expect(errors.some((error) => error.property === 'sortBy')).toBe(true);
  });

  it('accepts date-only ranges and rejects invalid or reversed ranges', async () => {
    await expect(
      validate(
        plainToInstance(BranchListQueryDto, {
          createdFrom: '2026-06-01',
          createdTo: '2026-06-30',
        }),
      ),
    ).resolves.toHaveLength(0);

    const invalidDate = await validate(
      plainToInstance(BranchListQueryDto, {
        createdFrom: '2026-02-31',
      }),
    );
    expect(invalidDate.some((error) => error.property === 'createdFrom')).toBe(
      true,
    );

    const reversed = await validate(
      plainToInstance(BranchListQueryDto, {
        createdFrom: '2026-07-01',
        createdTo: '2026-06-30',
      }),
    );
    expect(reversed.some((error) => error.property === 'createdRange')).toBe(
      true,
    );
  });

  it('accepts from-only and to-only filters', async () => {
    await expect(
      validate(
        plainToInstance(BranchListQueryDto, {
          createdFrom: '2026-06-01',
        }),
      ),
    ).resolves.toHaveLength(0);
    await expect(
      validate(
        plainToInstance(BranchListQueryDto, {
          createdTo: '2026-06-30',
        }),
      ),
    ).resolves.toHaveLength(0);
  });
});
