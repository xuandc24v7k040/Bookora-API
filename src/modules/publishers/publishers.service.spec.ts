import type {
  PublishersRepository,
  PublisherRecord,
} from './publishers.repository';
import { PublishersService } from './publishers.service';
const row: PublisherRecord = {
  id: '01J00000000000000000000002',
  name: 'Nhà xuất bản Trẻ',
  slug: 'nha-xuat-ban-tre',
  createdAt: new Date('2026-07-01'),
  updatedAt: new Date('2026-07-01'),
  _count: { products: 0 },
};
describe('PublishersService', () => {
  it('returns usageCount without N+1 queries', async () => {
    const repository = { list: jest.fn().mockResolvedValue([[row], 1]) };
    const service = new PublishersService(
      repository as unknown as PublishersRepository,
    );
    const result = await service.findAll({ page: 1, limit: 10 });
    expect(result.data).toEqual([expect.objectContaining({ usageCount: 0 })]);
    expect(repository.list).toHaveBeenCalledTimes(1);
  });
});
