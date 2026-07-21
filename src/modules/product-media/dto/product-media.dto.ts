import { Transform } from 'class-transformer';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PRODUCT_MEDIA_ALT_TEXT_MAX_LENGTH } from '../product-media.constants';

const ULID_PATTERN = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class ProductMediaQueryDto {
  @ApiPropertyOptional({ type: String, format: 'ulid' })
  @IsOptional()
  @Matches(ULID_PATTERN, { message: 'Mã biến thể không hợp lệ' })
  variantId?: string;
}

export class UploadProductMediaDto {
  @ApiPropertyOptional({ type: String, format: 'ulid' })
  @IsOptional()
  @Matches(ULID_PATTERN, { message: 'Mã biến thể không hợp lệ' })
  variantId?: string;

  @ApiPropertyOptional({ maxLength: PRODUCT_MEDIA_ALT_TEXT_MAX_LENGTH })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(PRODUCT_MEDIA_ALT_TEXT_MAX_LENGTH, {
    message: 'Mô tả ảnh không được vượt quá 200 ký tự',
  })
  altText?: string;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  isPrimary?: boolean;
}

export class UpdateProductMediaDto {
  @ApiPropertyOptional({
    nullable: true,
    type: String,
    maxLength: PRODUCT_MEDIA_ALT_TEXT_MAX_LENGTH,
  })
  @IsOptional()
  @Transform(trimString)
  @ValidateIf(({ altText }) => altText !== null)
  @IsString()
  @MaxLength(PRODUCT_MEDIA_ALT_TEXT_MAX_LENGTH, {
    message: 'Mô tả ảnh không được vượt quá 200 ký tự',
  })
  altText?: string | null;
}

export class ReorderProductMediaDto {
  @ApiPropertyOptional({ nullable: true, type: String, format: 'ulid' })
  @IsOptional()
  @ValidateIf(({ variantId }) => variantId !== null)
  @Matches(ULID_PATTERN, { message: 'Mã biến thể không hợp lệ' })
  variantId?: string | null;

  @ApiProperty({ type: [String], format: 'ulid' })
  @IsArray()
  @ArrayNotEmpty({ message: 'Danh sách sắp xếp không được để trống' })
  @ArrayUnique({ message: 'Danh sách sắp xếp có ảnh bị trùng' })
  @Matches(ULID_PATTERN, {
    each: true,
    message: 'Danh sách sắp xếp chứa mã ảnh không hợp lệ',
  })
  orderedMediaIds!: string[];
}
