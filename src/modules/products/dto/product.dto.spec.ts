import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateProductOptionValueDto,
  UpdateProductVariantDto,
} from './product.dto';

describe('CreateProductOptionValueDto', () => {
  const dto = (colorCode: string | null) =>
    plainToInstance(CreateProductOptionValueDto, {
      label: 'Xanh',
      value: 'BLUE',
      colorCode,
      sortOrder: 0,
    });

  it.each(['#2563EB', '#aabbcc'])(
    'accepts six-digit color %s',
    async (colorCode) => {
      await expect(validate(dto(colorCode))).resolves.toHaveLength(0);
    },
  );

  it.each(['#RRGGBB', '#GG0000', '#fff', '#2563EBFF'])(
    'rejects invalid color %s',
    async (colorCode) => {
      await expect(validate(dto(colorCode))).resolves.not.toHaveLength(0);
    },
  );

  it('accepts null', async () => {
    await expect(validate(dto(null))).resolves.toHaveLength(0);
  });
});

describe('UpdateProductVariantDto', () => {
  it('keeps omitted boolean fields undefined for PATCH semantics', () => {
    const dto = plainToInstance(UpdateProductVariantDto, {
      name: 'Mặc định đã cập nhật',
    });

    expect(dto.isDefault).toBeUndefined();
    expect(dto.isActive).toBeUndefined();
  });
});
