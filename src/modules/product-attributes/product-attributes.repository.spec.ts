import { ProductAttributeType } from '@/generated/prisma/client';
import type { PrismaService } from '@/database/prisma.service';
import { ProductAttributesRepository } from './product-attributes.repository';
function setup() {
  const productAttribute = {
    findUnique: jest.fn(),
    findFirst: jest.fn().mockResolvedValue(null),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const prisma = {
    $transaction: jest.fn(
      async (
        cb: (tx: {
          productAttribute: typeof productAttribute;
        }) => Promise<unknown>,
      ) => cb({ productAttribute }),
    ),
  };
  return {
    productAttribute,
    repository: new ProductAttributesRepository(
      prisma as unknown as PrismaService,
    ),
  };
}
const current = {
  id: '01J00000000000000000000004',
  name: 'Ngôn ngữ',
  code: 'LANGUAGE',
  type: ProductAttributeType.TEXT,
  createdAt: new Date(),
  updatedAt: new Date(),
  _count: { values: 1 },
};
describe('ProductAttributesRepository used invariants', () => {
  it('blocks changing code while values exist', async () => {
    const { productAttribute, repository } = setup();
    productAttribute.findUnique.mockResolvedValue(current);
    await expect(
      repository.update(current.id, { code: 'LOCALE' }),
    ).rejects.toMatchObject({
      code: 'PRODUCT_ATTRIBUTE_CODE_CHANGE_REQUIRES_UNUSED',
    });
    expect(productAttribute.update).not.toHaveBeenCalled();
  });
  it('blocks changing type while values exist but permits name updates', async () => {
    const { productAttribute, repository } = setup();
    productAttribute.findUnique.mockResolvedValue(current);
    await expect(
      repository.update(current.id, { type: ProductAttributeType.NUMBER }),
    ).rejects.toMatchObject({
      code: 'PRODUCT_ATTRIBUTE_TYPE_CHANGE_REQUIRES_UNUSED',
    });
    productAttribute.update.mockResolvedValue({
      ...current,
      name: 'Ngôn ngữ hiển thị',
    });
    await expect(
      repository.update(current.id, { name: 'Ngôn ngữ hiển thị' }),
    ).resolves.toMatchObject({ name: 'Ngôn ngữ hiển thị' });
  });
  it('blocks delete when attribute values exist', async () => {
    const { productAttribute, repository } = setup();
    productAttribute.findUnique.mockResolvedValue(current);
    await expect(repository.remove(current.id)).rejects.toMatchObject({
      code: 'PRODUCT_ATTRIBUTE_IN_USE',
    });
    expect(productAttribute.delete).not.toHaveBeenCalled();
  });
});
