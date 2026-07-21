import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsDefined,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { ProductStatus } from '@/generated/prisma/client';

const ULID_PATTERN = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
const CODE_PATTERN = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/;
const SKU_PATTERN = /^[A-Z0-9][A-Z0-9._/-]*$/;
const VND_PATTERN = /^(0|[1-9]\d{0,12})$/;
const COLOR_CODE_PATTERN = /^#[0-9A-Fa-f]{6}$/;

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const optionalTrimmed = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const normalized = value.trim();
  return normalized.length ? normalized : null;
};
const normalizedCode = ({ value }: { value: unknown }) =>
  typeof value === 'string'
    ? value
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, '_')
    : value;

export enum ProductSortField {
  NAME = 'name',
  STATUS = 'status',
  RELEASE_DATE = 'releaseDate',
  CREATED_AT = 'createdAt',
  UPDATED_AT = 'updatedAt',
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export class ProductListQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt({ message: 'Trang phải là số nguyên' })
  @Min(1, { message: 'Trang phải lớn hơn hoặc bằng 1' })
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt({ message: 'Số dòng phải là số nguyên' })
  @Min(1, { message: 'Số dòng phải lớn hơn hoặc bằng 1' })
  @Max(100, { message: 'Số dòng không được vượt quá 100' })
  @IsOptional()
  limit?: number = 10;

  @ApiPropertyOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(200)
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ enum: ProductStatus })
  @IsEnum(ProductStatus, { message: 'Trạng thái sản phẩm không hợp lệ' })
  @IsOptional()
  status?: ProductStatus;

  @ApiPropertyOptional({ format: 'ulid' })
  @Matches(ULID_PATTERN, { message: 'Danh mục không hợp lệ' })
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional({ format: 'ulid' })
  @Matches(ULID_PATTERN, { message: 'Nhà cung cấp không hợp lệ' })
  @IsOptional()
  supplierId?: string;

  @ApiPropertyOptional({ format: 'ulid' })
  @Matches(ULID_PATTERN, { message: 'Nhà xuất bản không hợp lệ' })
  @IsOptional()
  publisherId?: string;

  @ApiPropertyOptional({ format: 'ulid' })
  @Matches(ULID_PATTERN, { message: 'Tác giả không hợp lệ' })
  @IsOptional()
  authorId?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsDateString({}, { message: 'Ngày tạo từ không hợp lệ' })
  @IsOptional()
  createdFrom?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsDateString({}, { message: 'Ngày tạo đến không hợp lệ' })
  @IsOptional()
  createdTo?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsDateString({}, { message: 'Ngày phát hành từ không hợp lệ' })
  @IsOptional()
  releaseFrom?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsDateString({}, { message: 'Ngày phát hành đến không hợp lệ' })
  @IsOptional()
  releaseTo?: string;

  @ApiPropertyOptional({
    enum: ProductSortField,
    default: ProductSortField.CREATED_AT,
  })
  @IsEnum(ProductSortField, { message: 'Cột sắp xếp không hợp lệ' })
  @IsOptional()
  sortBy?: ProductSortField = ProductSortField.CREATED_AT;

  @ApiPropertyOptional({ enum: SortOrder, default: SortOrder.DESC })
  @IsEnum(SortOrder, { message: 'Chiều sắp xếp không hợp lệ' })
  @IsOptional()
  sortOrder?: SortOrder = SortOrder.DESC;
}

export class ProductAttributeValueInputDto {
  @ApiProperty({ format: 'ulid' })
  @Matches(ULID_PATTERN, { message: 'Thuộc tính không hợp lệ' })
  attributeId!: string;

  @ApiProperty({
    oneOf: [
      { type: 'string' },
      { type: 'number' },
      { type: 'boolean' },
      { type: 'array', items: { type: 'string' } },
    ],
  })
  @IsDefined({ message: 'Vui lòng nhập giá trị thuộc tính' })
  value!: unknown;
}

export class CreateProductDto {
  @ApiProperty({ minLength: 2, maxLength: 255 })
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập tên sản phẩm' })
  @MinLength(2, { message: 'Tên sản phẩm phải có ít nhất 2 ký tự' })
  @MaxLength(255, { message: 'Tên sản phẩm không được vượt quá 255 ký tự' })
  name!: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 500 })
  @Transform(optionalTrimmed)
  @IsString()
  @MaxLength(500, { message: 'Mô tả ngắn không được vượt quá 500 ký tự' })
  @IsOptional()
  shortDescription?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'HTML Tiptap được backend làm sạch theo allowlist',
  })
  @IsString()
  @MaxLength(100_000, { message: 'Mô tả chi tiết quá dài' })
  @IsOptional()
  description?: string | null;

  @ApiPropertyOptional({ type: String, format: 'ulid', nullable: true })
  @Matches(ULID_PATTERN, { message: 'Nhà cung cấp không hợp lệ' })
  @IsOptional()
  supplierId?: string | null;

  @ApiPropertyOptional({ type: String, format: 'ulid', nullable: true })
  @Matches(ULID_PATTERN, { message: 'Nhà xuất bản không hợp lệ' })
  @IsOptional()
  publisherId?: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsDateString({}, { message: 'Ngày phát hành không hợp lệ' })
  @IsOptional()
  releaseDate?: string | null;

  @ApiProperty({ type: [String], format: 'ulid', default: [] })
  @IsArray({ message: 'Danh mục phải là một danh sách' })
  @ArrayUnique(undefined, { message: 'Danh mục không được trùng lặp' })
  @ArrayMaxSize(100)
  @Matches(ULID_PATTERN, { each: true, message: 'Danh mục không hợp lệ' })
  categoryIds!: string[];

  @ApiProperty({ type: [String], format: 'ulid', default: [] })
  @IsArray({ message: 'Tác giả phải là một danh sách' })
  @ArrayUnique(undefined, { message: 'Tác giả không được trùng lặp' })
  @ArrayMaxSize(100)
  @Matches(ULID_PATTERN, { each: true, message: 'Tác giả không hợp lệ' })
  authorIds!: string[];

  @ApiProperty({ type: [ProductAttributeValueInputDto], default: [] })
  @IsArray({ message: 'Thuộc tính phải là một danh sách' })
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ProductAttributeValueInputDto)
  attributeValues!: ProductAttributeValueInputDto[];
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class UpdateProductStatusDto {
  @ApiProperty({ enum: ProductStatus })
  @IsEnum(ProductStatus, { message: 'Trạng thái sản phẩm không hợp lệ' })
  status!: ProductStatus;
}

export class CreateProductOptionDto {
  @ApiProperty({ maxLength: 100 })
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập tên lựa chọn' })
  @MaxLength(100)
  name!: string;

  @ApiProperty({ pattern: CODE_PATTERN.source })
  @Transform(normalizedCode)
  @IsString()
  @Matches(CODE_PATTERN, {
    message: 'Mã lựa chọn phải ở dạng UPPER_SNAKE_CASE',
  })
  @MaxLength(64)
  code!: string;

  @ApiPropertyOptional({ default: 0 })
  @Type(() => Number)
  @IsInt({ message: 'Thứ tự phải là số nguyên' })
  @Min(0)
  @IsOptional()
  sortOrder?: number = 0;
}

export class UpdateProductOptionDto extends PartialType(
  CreateProductOptionDto,
) {}

export class CreateProductOptionValueDto {
  @ApiProperty({ maxLength: 100 })
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập tên hiển thị' })
  @MaxLength(100)
  label!: string;

  @ApiProperty({ pattern: CODE_PATTERN.source })
  @Transform(normalizedCode)
  @IsString()
  @Matches(CODE_PATTERN, {
    message: 'Giá trị kỹ thuật phải ở dạng UPPER_SNAKE_CASE',
  })
  @MaxLength(64)
  value!: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: '#2563EB' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(COLOR_CODE_PATTERN, {
    message: 'Mã màu phải có dạng #RRGGBB, ví dụ #2563EB',
  })
  @IsOptional()
  colorCode?: string | null;

  @ApiPropertyOptional({ default: 0 })
  @Type(() => Number)
  @IsInt({ message: 'Thứ tự phải là số nguyên' })
  @Min(0)
  @IsOptional()
  sortOrder?: number = 0;
}

export class UpdateProductOptionValueDto extends PartialType(
  CreateProductOptionValueDto,
) {}

export class CreateProductVariantDto {
  @ApiProperty({ maxLength: 255 })
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập tên biến thể' })
  @MaxLength(255)
  name!: string;

  @ApiProperty({ pattern: SKU_PATTERN.source })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(SKU_PATTERN, {
    message: 'SKU chỉ được chứa chữ in hoa, số và các ký tự . _ / -',
  })
  @MaxLength(100)
  sku!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Transform(optionalTrimmed)
  @IsString()
  @MaxLength(100)
  @IsOptional()
  barcode?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Transform(optionalTrimmed)
  @IsString()
  @MaxLength(32)
  @IsOptional()
  isbn?: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 0 })
  @Type(() => Number)
  @IsInt({ message: 'Năm xuất bản phải là số nguyên' })
  @Min(0)
  @Max(9999)
  @IsOptional()
  publicationYear?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 0 })
  @Type(() => Number)
  @IsInt({ message: 'Số trang phải là số nguyên' })
  @Min(0)
  @IsOptional()
  pageCount?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 0 })
  @Type(() => Number)
  @IsInt({ message: 'Khối lượng phải là số nguyên' })
  @Min(0)
  @IsOptional()
  weightGram?: number | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @Transform(optionalTrimmed)
  @IsString()
  @MaxLength(100)
  @IsOptional()
  packageSize?: string | null;

  @ApiProperty({ type: String, pattern: VND_PATTERN.source, example: '45000' })
  @IsString({ message: 'Giá bán gốc phải là chuỗi số nguyên' })
  @Matches(VND_PATTERN, {
    message:
      'Giá bán gốc chỉ được nhập theo đơn vị đồng và không vượt quá giới hạn',
  })
  originalPrice!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    pattern: VND_PATTERN.source,
    example: '40500',
  })
  @IsString({ message: 'Giá khuyến mãi phải là chuỗi số nguyên' })
  @Matches(VND_PATTERN, {
    message:
      'Giá khuyến mãi chỉ được nhập theo đơn vị đồng và không vượt quá giới hạn',
  })
  @IsOptional()
  salePrice?: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsDateString({}, { message: 'Thời gian bắt đầu khuyến mãi không hợp lệ' })
  @IsOptional()
  saleStartAt?: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsDateString({}, { message: 'Thời gian kết thúc khuyến mãi không hợp lệ' })
  @IsOptional()
  saleEndAt?: string | null;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiProperty({ type: [String], format: 'ulid', default: [] })
  @IsArray({ message: 'Giá trị lựa chọn phải là một danh sách' })
  @ArrayUnique(undefined, { message: 'Giá trị lựa chọn không được trùng lặp' })
  @ArrayMaxSize(20)
  @Matches(ULID_PATTERN, {
    each: true,
    message: 'Giá trị lựa chọn không hợp lệ',
  })
  optionValueIds!: string[];
}

export class UpdateProductVariantDto extends PartialType(
  CreateProductVariantDto,
) {}

export class BulkCreateProductVariantsDto {
  @ApiProperty({ type: [CreateProductVariantDto], maxItems: 200 })
  @IsArray({ message: 'Danh sách biến thể không hợp lệ' })
  @ArrayMaxSize(200, {
    message: 'Không thể tạo quá 200 biến thể trong một lần',
  })
  @ValidateNested({ each: true })
  @Type(() => CreateProductVariantDto)
  variants!: CreateProductVariantDto[];
}

export class GenerateVariantPreviewDto {
  @ApiPropertyOptional({
    description: 'Body rỗng; Options/Values được đọc từ backend',
  })
  @IsOptional()
  @IsIn([undefined])
  reserved?: never;
}
