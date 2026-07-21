import type {
  SuppliersRepository,
  SupplierRecord,
} from './suppliers.repository';
import { UsageStatus } from '@/common/dto/master-data-query.dto';
import { SortDirection } from '@/common/enums/sort-direction.enum';
import { SupplierSortField } from './dto/supplier.dto';
import { SuppliersService } from './suppliers.service';
const record: SupplierRecord = {
  id: '01J00000000000000000000001',
  name: 'Nhà cung cấp A',
  slug: 'nha-cung-cap-a',
  phone: null,
  email: null,
  address: null,
  createdAt: new Date('2026-07-01T00:00:00Z'),
  updatedAt: new Date('2026-07-02T00:00:00Z'),
  _count: { products: 2 },
};
describe('SuppliersService', () => {
  const repository = {
    list: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };
  const service = new SuppliersService(
    repository as unknown as SuppliersRepository,
  );
  beforeEach(() => jest.clearAllMocks());
  it('composes server filters, usage count sorting and stable pagination', async () => {
    repository.list.mockResolvedValue([[record], 1]);
    const result = await service.findAll({
      page: 2,
      limit: 10,
      search: 'sách',
      hasPhone: false,
      usageStatus: UsageStatus.USED,
      createdFrom: '2026-07-01',
      createdTo: '2026-07-02',
      sortBy: SupplierSortField.USAGE_COUNT,
      sortOrder: SortDirection.DESC,
    });
    expect(result.data[0]).toMatchObject({ id: record.id, usageCount: 2 });
    expect(result.meta).toMatchObject({ page: 2, total: 1, lastPage: 1 });
    expect(repository.list).toHaveBeenCalledWith(
      expect.objectContaining({ AND: expect.any(Array) }),
      [{ products: { _count: 'desc' } }, { id: 'asc' }],
      10,
      10,
    );
  });
  it('regenerates slug response through repository update', async () => {
    repository.update.mockResolvedValue({
      ...record,
      name: 'Tên mới',
      slug: 'ten-moi',
    });
    await expect(
      service.update(record.id, { name: 'Tên mới' }),
    ).resolves.toMatchObject({ slug: 'ten-moi' });
  });
});
