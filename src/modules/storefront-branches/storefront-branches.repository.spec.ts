import { StorefrontBranchesRepository } from './storefront-branches.repository';

describe('StorefrontBranchesRepository', () => {
  it('queries only active branches with a stable public projection', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new StorefrontBranchesRepository({
      branch: { findMany },
    } as never);

    await repository.listActive();

    expect(findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: [{ name: 'asc' }, { code: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        address: true,
        province: true,
        ward: true,
      },
    });
  });
});
