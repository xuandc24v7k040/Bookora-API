import { InventoryService } from './inventory.service';

const variantRecord = (id: string, quantity?: number) => ({
  id,
  productId: 'product-1',
  name: id,
  sku: `SKU-${id}`,
  barcode: null,
  isDefault: false,
  isActive: true,
  product: {
    name: 'Sản phẩm',
    status: 'ACTIVE',
    media: [],
  },
  media: [],
  optionValues: [],
  stocks: quantity === undefined ? [] : [{ quantity }],
});

describe('InventoryService variant selector stock', () => {
  it('returns canonical stock for the selected branch and defaults a missing row to zero', async () => {
    const repository = {
      listVariantOptions: jest
        .fn()
        .mockResolvedValue([
          [
            variantRecord('variant-with-stock', 7),
            variantRecord('variant-new'),
          ],
          1,
        ]),
    };
    const branchContext = {
      requireSelectedBranch: jest.fn().mockReturnValue('branch-a'),
    };
    const service = new InventoryService(
      repository as never,
      branchContext as never,
    );

    await expect(
      service.listVariantOptions({} as never, { page: 1, limit: 20 }),
    ).resolves.toMatchObject({
      data: [
        { id: 'variant-with-stock', currentStock: 7 },
        { id: 'variant-new', currentStock: 0 },
      ],
    });
    expect(repository.listVariantOptions).toHaveBeenCalledWith(
      'branch-a',
      undefined,
      0,
      20,
    );
  });

  it('uses the newly selected branch on the next request', async () => {
    const repository = {
      listVariantOptions: jest
        .fn()
        .mockResolvedValueOnce([[variantRecord('variant-1', 7)], 1])
        .mockResolvedValueOnce([[variantRecord('variant-1', 2)], 1]),
    };
    const branchContext = {
      requireSelectedBranch: jest
        .fn()
        .mockReturnValueOnce('branch-a')
        .mockReturnValueOnce('branch-b'),
    };
    const service = new InventoryService(
      repository as never,
      branchContext as never,
    );

    const first = await service.listVariantOptions({} as never, {});
    const second = await service.listVariantOptions({} as never, {});

    expect(first.data[0]?.currentStock).toBe(7);
    expect(second.data[0]?.currentStock).toBe(2);
    expect(repository.listVariantOptions).toHaveBeenNthCalledWith(
      2,
      'branch-b',
      undefined,
      0,
      10,
    );
  });
});
