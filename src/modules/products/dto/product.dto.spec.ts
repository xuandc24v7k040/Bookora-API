import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateProductOptionDto,
  CreateProductOptionValueDto,
  CreateProductVariantDto,
  UpdateProductOptionDto,
  UpdateProductVariantDto,
} from './product.dto';
import { ProductOptionPresentationType } from '@/generated/prisma/client';

describe('CreateProductVariantDto weightGram', () => {
  const weightErrors = async (weightGram: unknown) => {
    const dto = plainToInstance(CreateProductVariantDto, { weightGram });
    return (await validate(dto)).filter(
      (error) => error.property === 'weightGram',
    );
  };

  it.each([
    undefined,
    null,
    '',
    0,
    -1,
    1.5,
    '350.5',
    Number.NaN,
    Infinity,
    'abc',
  ])('rejects invalid weight %p', async (weightGram) => {
    await expect(weightErrors(weightGram)).resolves.not.toHaveLength(0);
  });

  it('accepts a positive integer weight in gram', async () => {
    await expect(weightErrors(350)).resolves.toHaveLength(0);
  });
});

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

  it.each([null, '', 0, -1, 1.5, '350.5', Number.NaN, Infinity, 'abc'])(
    'rejects explicit invalid weight %p while preserving PATCH omission',
    async (weightGram) => {
      const dto = plainToInstance(UpdateProductVariantDto, { weightGram });
      const errors = (await validate(dto)).filter(
        (error) => error.property === 'weightGram',
      );
      expect(errors).not.toHaveLength(0);
    },
  );

  it('accepts omitted or valid PATCH weight', async () => {
    const omitted = plainToInstance(UpdateProductVariantDto, {});
    const valid = plainToInstance(UpdateProductVariantDto, { weightGram: 350 });
    await expect(validate(omitted)).resolves.toHaveLength(0);
    await expect(validate(valid)).resolves.toHaveLength(0);
  });
});

describe('Product option presentation DTOs', () => {
  it('keeps omitted presentation type undefined so Prisma supplies TEXT on create', async () => {
    const dto = plainToInstance(CreateProductOptionDto, {
      name: 'Hình thức bìa',
      code: 'COVER',
    });
    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.presentationType).toBeUndefined();
  });

  it.each(Object.values(ProductOptionPresentationType))(
    'accepts presentation type %s',
    async (presentationType) => {
      const dto = plainToInstance(CreateProductOptionDto, {
        name: 'Lựa chọn',
        code: 'OPTION',
        presentationType,
      });
      await expect(validate(dto)).resolves.toHaveLength(0);
    },
  );

  it('keeps omitted presentation type undefined on PATCH', () => {
    const dto = plainToInstance(UpdateProductOptionDto, { name: 'Tên mới' });
    expect(dto.presentationType).toBeUndefined();
  });
});
