import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProductAttributeType } from '@/generated/prisma/client';
import {
  paginationMeta,
  startOfNextVietnamDate,
  startOfVietnamDate,
} from '@/common/utils/master-data.util';
import type {
  BulkCreateProductVariantsDto,
  CreateProductDto,
  CreateProductOptionDto,
  CreateProductOptionValueDto,
  CreateProductVariantDto,
  ProductListQueryDto,
  UpdateProductDto,
  UpdateProductOptionDto,
  UpdateProductOptionValueDto,
  UpdateProductStatusDto,
  UpdateProductVariantDto,
} from './dto';
import { ProductSortField } from './dto';
import {
  PRODUCT_ERROR_MESSAGES,
  ProductDomainError,
} from './products.constants';
import {
  type ProductDetailRecord,
  type ProductListRecord,
  type ProductOptionRecord,
  type ProductVariantRecord,
  ProductsRepository,
} from './products.repository';

const BAD_REQUEST_CODES = new Set([
  'PRODUCT_CONFIGURATION_INVALID',
  'PRODUCT_SIMPLE_VARIANT_REQUIRED',
  'PRODUCT_DEFAULT_VARIANT_REQUIRED',
  'PRODUCT_VARIANT_INCOMPLETE_OPTIONS',
  'PRODUCT_VARIANT_OPTION_VALUE_SCOPE_MISMATCH',
  'PRODUCT_VARIANT_MATRIX_TOO_LARGE',
  'PRODUCT_PRICE_INVALID',
  'PRODUCT_SALE_PERIOD_INVALID',
  'PRODUCT_ATTRIBUTE_VALUE_INVALID',
  'PRODUCT_MEDIA_REQUIRED',
]);

@Injectable()
export class ProductsService {
  constructor(private readonly repository: ProductsRepository) {}

  async findAll(query: ProductListQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const [rows, total] = await this.repository.list(
      this.buildWhere(query),
      this.buildOrderBy(query),
      (page - 1) * limit,
      limit,
    );
    return {
      data: rows.map((row) => this.toListResponse(row)),
      meta: paginationMeta(total, page, limit),
    };
  }

  async findOne(id: string) {
    const product = await this.repository.findById(id);
    if (!product) this.notFound();
    return this.toDetailResponse(product);
  }

  async create(dto: CreateProductDto) {
    return this.execute(async () =>
      this.toDetailResponse(await this.repository.create(dto)),
    );
  }

  async update(id: string, dto: UpdateProductDto) {
    return this.execute(async () => {
      const product = await this.repository.update(id, dto);
      if (!product) this.notFound();
      return this.toDetailResponse(product);
    });
  }

  async updateStatus(id: string, dto: UpdateProductStatusDto) {
    return this.execute(async () => {
      const product = await this.repository.updateStatus(id, dto.status);
      if (!product) this.notFound();
      return this.toDetailResponse(product);
    });
  }

  async remove(id: string) {
    return this.execute(async () => {
      const result = await this.repository.remove(id);
      if (!result) this.notFound();
      return result;
    });
  }

  async listOptions(productId: string) {
    await this.assertProduct(productId);
    return (await this.repository.listOptions(productId)).map((option) =>
      this.toOptionResponse(option),
    );
  }

  createOption(productId: string, dto: CreateProductOptionDto) {
    return this.execute(async () =>
      this.toOptionResponse(await this.repository.createOption(productId, dto)),
    );
  }

  updateOption(
    productId: string,
    optionId: string,
    dto: UpdateProductOptionDto,
  ) {
    return this.execute(async () => {
      const option = await this.repository.updateOption(
        productId,
        optionId,
        dto,
      );
      if (!option) this.optionNotFound();
      return this.toOptionResponse(option);
    });
  }

  removeOption(productId: string, optionId: string) {
    return this.execute(async () => {
      const option = await this.repository.removeOption(productId, optionId);
      if (!option) this.optionNotFound();
      return this.toOptionResponse(option);
    });
  }

  createOptionValue(
    productId: string,
    optionId: string,
    dto: CreateProductOptionValueDto,
  ) {
    return this.execute(async () =>
      this.toOptionValueResponse(
        await this.repository.createOptionValue(productId, optionId, dto),
      ),
    );
  }

  updateOptionValue(
    productId: string,
    optionId: string,
    valueId: string,
    dto: UpdateProductOptionValueDto,
  ) {
    return this.execute(async () => {
      const value = await this.repository.updateOptionValue(
        productId,
        optionId,
        valueId,
        dto,
      );
      if (!value) this.optionValueNotFound();
      return this.toOptionValueResponse(value);
    });
  }

  removeOptionValue(productId: string, optionId: string, valueId: string) {
    return this.execute(async () => {
      const value = await this.repository.removeOptionValue(
        productId,
        optionId,
        valueId,
      );
      if (!value) this.optionValueNotFound();
      return {
        id: value.id,
        label: value.label,
        value: value.value,
        colorCode: value.colorCode,
        sortOrder: value.sortOrder,
        usageCount: value._count.variantLinks,
      };
    });
  }

  async listVariants(productId: string) {
    await this.assertProduct(productId);
    return (await this.repository.listVariants(productId)).map((variant) =>
      this.toVariantResponse(variant),
    );
  }

  async findVariant(productId: string, variantId: string) {
    const variant = await this.repository.findVariant(productId, variantId);
    if (!variant) this.variantNotFound();
    return this.toVariantResponse(variant);
  }

  createVariant(productId: string, dto: CreateProductVariantDto) {
    return this.execute(async () =>
      this.toVariantResponse(
        await this.repository.createVariant(productId, dto),
      ),
    );
  }

  bulkCreateVariants(productId: string, dto: BulkCreateProductVariantsDto) {
    return this.execute(async () =>
      (await this.repository.bulkCreateVariants(productId, dto)).map(
        (variant) => this.toVariantResponse(variant),
      ),
    );
  }

  updateVariant(
    productId: string,
    variantId: string,
    dto: UpdateProductVariantDto,
  ) {
    return this.execute(async () => {
      const variant = await this.repository.updateVariant(
        productId,
        variantId,
        dto,
      );
      if (!variant) this.variantNotFound();
      return this.toVariantResponse(variant);
    });
  }

  setDefaultVariant(productId: string, variantId: string) {
    return this.execute(async () => {
      const variant = await this.repository.setDefaultVariant(
        productId,
        variantId,
      );
      if (!variant) this.variantNotFound();
      return this.toVariantResponse(variant);
    });
  }

  removeVariant(productId: string, variantId: string) {
    return this.execute(async () => {
      const variant = await this.repository.removeVariant(productId, variantId);
      if (!variant) this.variantNotFound();
      return this.toVariantResponse(variant);
    });
  }

  generatePreview(productId: string) {
    return this.execute(async () => {
      const preview = await this.repository.generatePreview(productId);
      if (!preview) this.notFound();
      return preview;
    });
  }

  private async assertProduct(id: string) {
    if (!(await this.repository.findById(id))) this.notFound();
  }

  private buildWhere(query: ProductListQueryDto): Prisma.ProductWhereInput {
    const filters: Prisma.ProductWhereInput[] = [];
    if (query.search) {
      filters.push({
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { slug: { contains: query.search, mode: 'insensitive' } },
          {
            variants: {
              some: {
                OR: [
                  { sku: { contains: query.search, mode: 'insensitive' } },
                  { isbn: { contains: query.search, mode: 'insensitive' } },
                  { barcode: { contains: query.search, mode: 'insensitive' } },
                ],
              },
            },
          },
        ],
      });
    }
    if (query.status) filters.push({ status: query.status });
    if (query.categoryId)
      filters.push({ categories: { some: { categoryId: query.categoryId } } });
    if (query.supplierId) filters.push({ supplierId: query.supplierId });
    if (query.publisherId) filters.push({ publisherId: query.publisherId });
    if (query.authorId)
      filters.push({ authors: { some: { authorId: query.authorId } } });
    if (query.createdFrom || query.createdTo)
      filters.push({
        createdAt: {
          ...(query.createdFrom
            ? { gte: startOfVietnamDate(query.createdFrom) }
            : {}),
          ...(query.createdTo
            ? { lt: startOfNextVietnamDate(query.createdTo) }
            : {}),
        },
      });
    if (query.releaseFrom || query.releaseTo)
      filters.push({
        releaseDate: {
          ...(query.releaseFrom
            ? { gte: startOfVietnamDate(query.releaseFrom) }
            : {}),
          ...(query.releaseTo
            ? { lt: startOfNextVietnamDate(query.releaseTo) }
            : {}),
        },
      });
    return filters.length ? { AND: filters } : {};
  }

  private buildOrderBy(
    query: ProductListQueryDto,
  ): Prisma.ProductOrderByWithRelationInput[] {
    const field = query.sortBy ?? ProductSortField.CREATED_AT;
    const direction = query.sortOrder ?? 'desc';
    return [{ [field]: direction }, { id: 'asc' }];
  }

  private toListResponse(record: ProductListRecord) {
    const activeVariants = record.variants.filter(
      (variant) => variant.isActive,
    );
    const prices = activeVariants.map(
      (variant) => variant.salePrice ?? variant.originalPrice,
    );
    const defaultVariant =
      record.variants.find((variant) => variant.isDefault) ?? null;
    return {
      id: record.id,
      name: record.name,
      slug: record.slug,
      status: record.status,
      releaseDate: record.releaseDate?.toISOString() ?? null,
      supplier: record.supplier,
      publisher: record.publisher,
      categories: record.categories.map((item) => item.category),
      authors: record.authors.map((item) => item.author),
      defaultVariant: defaultVariant
        ? {
            id: defaultVariant.id,
            name: defaultVariant.name,
            sku: defaultVariant.sku,
            originalPrice: defaultVariant.originalPrice.toString(),
            salePrice: defaultVariant.salePrice?.toString() ?? null,
            isActive: defaultVariant.isActive,
          }
        : null,
      minPrice: prices.length
        ? prices
            .reduce((min, price) => (price.lessThan(min) ? price : min))
            .toString()
        : null,
      maxPrice: prices.length
        ? prices
            .reduce((max, price) => (price.greaterThan(max) ? price : max))
            .toString()
        : null,
      variantCount: record._count.variants,
      activeVariantCount: activeVariants.length,
      optionCount: record._count.options,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private toDetailResponse(record: ProductDetailRecord) {
    const base = this.toListResponse(record);
    return {
      ...base,
      shortDescription: record.shortDescription,
      description: record.description,
      attributeValues: record.attributeValues.map((item) => ({
        id: item.id,
        attributeId: item.attributeId,
        name: item.attribute.name,
        code: item.attribute.code,
        type: item.attribute.type,
        value: attributeValue(item),
      })),
      configuration:
        record._count.options > 0
          ? 'OPTIONED'
          : record._count.variants > 0
            ? 'SIMPLE'
            : 'UNCONFIGURED',
    };
  }

  private toOptionResponse(option: ProductOptionRecord) {
    return {
      id: option.id,
      productId: option.productId,
      name: option.name,
      code: option.code,
      sortOrder: option.sortOrder,
      values: option.values.map((value) => ({
        id: value.id,
        label: value.label,
        value: value.value,
        colorCode: value.colorCode,
        sortOrder: value.sortOrder,
        usageCount: value._count.variantLinks,
      })),
      variantUsageCount: option._count.links,
    };
  }

  private toOptionValueResponse(value: {
    id: string;
    label: string;
    value: string;
    colorCode: string | null;
    sortOrder: number;
    _count: { variantLinks: number };
  }) {
    return {
      id: value.id,
      label: value.label,
      value: value.value,
      colorCode: value.colorCode,
      sortOrder: value.sortOrder,
      usageCount: value._count.variantLinks,
    };
  }

  private toVariantResponse(variant: ProductVariantRecord) {
    return {
      id: variant.id,
      productId: variant.productId,
      name: variant.name,
      sku: variant.sku,
      barcode: variant.barcode,
      combinationKey: variant.combinationKey,
      isbn: variant.isbn,
      publicationYear: variant.publicationYear,
      pageCount: variant.pageCount,
      weightGram: variant.weightGram,
      packageSize: variant.packageSize,
      originalPrice: variant.originalPrice.toString(),
      salePrice: variant.salePrice?.toString() ?? null,
      saleStartAt: variant.saleStartAt?.toISOString() ?? null,
      saleEndAt: variant.saleEndAt?.toISOString() ?? null,
      isDefault: variant.isDefault,
      isActive: variant.isActive,
      optionValues: variant.optionValues.map((item) => ({
        optionId: item.optionId,
        optionName: item.option.name,
        optionCode: item.option.code,
        optionValueId: item.optionValueId,
        label: item.optionValue.label,
        value: item.optionValue.value,
      })),
      createdAt: variant.createdAt.toISOString(),
      updatedAt: variant.updatedAt.toISOString(),
    };
  }

  private async execute<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      this.rethrow(error);
    }
  }

  private rethrow(error: unknown): never {
    if (error instanceof ProductDomainError) {
      const body = {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      };
      if (BAD_REQUEST_CODES.has(error.code))
        throw new BadRequestException(body);
      if (
        error.code.endsWith('_NOT_FOUND') ||
        error.code === 'PRODUCT_NOT_FOUND'
      )
        throw new NotFoundException(body);
      throw new ConflictException(body);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        const target = Array.isArray(error.meta?.target)
          ? error.meta.target.join(',')
          : typeof error.meta?.target === 'string'
            ? error.meta.target
            : '';
        const code = target.includes('sku')
          ? 'PRODUCT_VARIANT_SKU_ALREADY_EXISTS'
          : target.includes('combination')
            ? 'PRODUCT_VARIANT_COMBINATION_ALREADY_EXISTS'
            : target.includes('option_id') && target.includes('value')
              ? 'PRODUCT_OPTION_VALUE_ALREADY_EXISTS'
              : target.includes('product_id') && target.includes('code')
                ? 'PRODUCT_OPTION_CODE_ALREADY_EXISTS'
                : 'PRODUCT_CONFIGURATION_INVALID';
        throw new ConflictException({
          code,
          message: PRODUCT_ERROR_MESSAGES[code],
        });
      }
      if (error.code === 'P2034')
        throw new ConflictException({
          code: 'PRODUCT_CONCURRENT_UPDATE',
          message:
            'Dữ liệu sản phẩm vừa được thay đổi, vui lòng tải lại và thử lại',
        });
    }
    throw error;
  }

  private notFound(): never {
    throw new NotFoundException({
      code: 'PRODUCT_NOT_FOUND',
      message: PRODUCT_ERROR_MESSAGES.PRODUCT_NOT_FOUND,
    });
  }

  private optionNotFound(): never {
    throw new NotFoundException({
      code: 'PRODUCT_OPTION_NOT_FOUND',
      message: PRODUCT_ERROR_MESSAGES.PRODUCT_OPTION_NOT_FOUND,
    });
  }

  private optionValueNotFound(): never {
    throw new NotFoundException({
      code: 'PRODUCT_OPTION_VALUE_NOT_FOUND',
      message: PRODUCT_ERROR_MESSAGES.PRODUCT_OPTION_VALUE_NOT_FOUND,
    });
  }

  private variantNotFound(): never {
    throw new NotFoundException({
      code: 'PRODUCT_VARIANT_NOT_FOUND',
      message: PRODUCT_ERROR_MESSAGES.PRODUCT_VARIANT_NOT_FOUND,
    });
  }
}

function attributeValue(
  item: ProductDetailRecord['attributeValues'][number],
): unknown {
  switch (item.attribute.type) {
    case ProductAttributeType.TEXT:
    case ProductAttributeType.SINGLE_SELECT:
      return item.textValue;
    case ProductAttributeType.NUMBER:
      return item.numberValue?.toString() ?? null;
    case ProductAttributeType.BOOLEAN:
      return item.booleanValue;
    case ProductAttributeType.DATE:
      return item.dateValue?.toISOString() ?? null;
    case ProductAttributeType.MULTI_SELECT:
      return item.jsonValue;
  }
}
