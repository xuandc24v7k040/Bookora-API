import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { StockReceiptStatus } from '@/generated/prisma/client';
import { PaginationDto } from '@/common/dto/pagination.dto';
import { SortDirection } from '@/common/enums';

const ULID_PATTERN = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

const trimOptional = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value;
const nullableText = ({ value }: { value: unknown }) =>
  value === null
    ? null
    : typeof value === 'string'
      ? value.trim() || null
      : value;

export enum StockReceiptSortField {
  CODE = 'code',
  STATUS = 'status',
  CREATED_AT = 'createdAt',
  CONFIRMED_AT = 'confirmedAt',
}

export class StockReceiptListQueryDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOptional)
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: StockReceiptStatus })
  @IsOptional()
  @IsEnum(StockReceiptStatus)
  status?: StockReceiptStatus;

  @ApiPropertyOptional({ format: 'ulid' })
  @IsOptional()
  @Matches(ULID_PATTERN, { message: 'Nhà cung cấp không hợp lệ' })
  supplierId?: string;

  @ApiPropertyOptional({ example: '2026-07-01' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ngày bắt đầu không hợp lệ' })
  createdFrom?: string;

  @ApiPropertyOptional({ example: '2026-07-31' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ngày kết thúc không hợp lệ' })
  createdTo?: string;

  @ApiPropertyOptional({ enum: StockReceiptSortField })
  @IsOptional()
  @IsEnum(StockReceiptSortField)
  sortBy?: StockReceiptSortField;

  @ApiPropertyOptional({ enum: SortDirection })
  @IsOptional()
  @IsEnum(SortDirection)
  sortOrder?: SortDirection;
}

export class StockReceiptItemInputDto {
  @ApiProperty({ format: 'ulid' })
  @Matches(ULID_PATTERN, { message: 'Sản phẩm hoặc biến thể không hợp lệ' })
  variantId!: string;

  @ApiProperty({ minimum: 1, maximum: 2_147_483_647 })
  @Type(() => Number)
  @IsInt({ message: 'Số lượng nhập phải là số nguyên lớn hơn 0' })
  @Min(1, { message: 'Số lượng nhập phải là số nguyên lớn hơn 0' })
  @Max(2_147_483_647)
  quantity!: number;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    pattern: '^\\d{1,13}(\\.\\d{1,2})?$',
    example: '178000.00',
  })
  @IsOptional()
  @Transform(nullableText)
  @Matches(/^\d{1,13}(\.\d{1,2})?$/, { message: 'Giá vốn không hợp lệ' })
  costPrice?: string | null;
}

export class CreateStockReceiptDto {
  @ApiPropertyOptional({ type: String, format: 'ulid', nullable: true })
  @IsOptional()
  @Matches(ULID_PATTERN, { message: 'Nhà cung cấp đã chọn không hợp lệ' })
  supplierId?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 1000 })
  @IsOptional()
  @Transform(nullableText)
  @IsString()
  @MaxLength(1000, { message: 'Ghi chú không được vượt quá 1000 ký tự' })
  note?: string | null;

  @ApiPropertyOptional({ type: [StockReceiptItemInputDto], default: [] })
  @IsOptional()
  @IsArray()
  @ArrayUnique((item: StockReceiptItemInputDto) => item.variantId, {
    message: 'Sản phẩm hoặc biến thể này đã có trong phiếu nhập',
  })
  @ValidateNested({ each: true })
  @Type(() => StockReceiptItemInputDto)
  items?: StockReceiptItemInputDto[];
}

export class UpdateStockReceiptDraftDto extends PartialType(
  CreateStockReceiptDto,
) {}
