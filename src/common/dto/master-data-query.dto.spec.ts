import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MasterDataListQueryDto, UsageStatus } from './master-data-query.dto';
describe('MasterDataListQueryDto', () => {
  it('trims empty search and accepts the shared filters', async () => {
    const dto = plainToInstance(MasterDataListQueryDto, {
      page: '2',
      limit: '20',
      search: '   ',
      usageStatus: 'USED',
      createdFrom: '2026-07-01',
      createdTo: '2026-07-31',
      sortOrder: 'asc',
    });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto).toMatchObject({
      page: 2,
      limit: 20,
      search: undefined,
      usageStatus: UsageStatus.USED,
    });
  });
  it.each([
    { createdFrom: '2026-02-31' },
    { createdFrom: '2026-07-20', createdTo: '2026-07-19' },
  ])('rejects invalid calendar ranges %p', async (value) => {
    expect(
      (await validate(plainToInstance(MasterDataListQueryDto, value))).length,
    ).toBeGreaterThan(0);
  });
});
