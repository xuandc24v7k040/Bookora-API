import type { AuthorsRepository, AuthorRecord } from './authors.repository';
import { AuthorsService } from './authors.service';
const row: AuthorRecord = {
  id: '01J00000000000000000000003',
  name: 'Nguyễn Nhật Ánh',
  slug: 'nguyen-nhat-anh',
  createdAt: new Date('2026-07-01'),
  updatedAt: new Date('2026-07-01'),
  _count: { products: 3 },
};
describe('AuthorsService', () => {
  it('maps ProductAuthor count to usageCount', async () => {
    const repository = { findById: jest.fn().mockResolvedValue(row) };
    const service = new AuthorsService(
      repository as unknown as AuthorsRepository,
    );
    await expect(service.findOne(row.id)).resolves.toMatchObject({
      usageCount: 3,
      name: row.name,
    });
  });
});
