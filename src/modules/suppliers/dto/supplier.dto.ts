import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { MasterDataListQueryDto } from '@/common/dto/master-data-query.dto';
import {
  normalizeMasterDataName,
  normalizeNullableText,
} from '@/common/utils/master-data.util';

export enum SupplierSortField {
  NAME = 'name',
  PHONE = 'phone',
  EMAIL = 'email',
  ADDRESS = 'address',
  USAGE_COUNT = 'usageCount',
  CREATED_AT = 'createdAt',
  UPDATED_AT = 'updatedAt',
}

const nullableText = ({ value }: { value: unknown }) =>
  typeof value === 'string' || value === null
    ? normalizeNullableText(value)
    : value;

export class SupplierListQueryDto extends MasterDataListQueryDto {
  @ApiPropertyOptional({ enum: SupplierSortField })
  @IsOptional()
  @IsEnum(SupplierSortField)
  sortBy?: SupplierSortField;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  hasPhone?: boolean;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  hasEmail?: boolean;
}

export class CreateSupplierDto {
  @ApiProperty({ minLength: 2, maxLength: 120 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeMasterDataName(value) : value,
  )
  @IsString({ message: 'Vui lòng nhập tên nhà cung cấp' })
  @Length(2, 120, { message: 'Tên nhà cung cấp phải từ 2 đến 120 ký tự' })
  name!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @Transform(nullableText)
  @Matches(/^[+\d][\d\s().-]{7,19}$/, {
    message: 'Số điện thoại không đúng định dạng',
  })
  phone?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    const normalized = nullableText({ value });
    return typeof normalized === 'string'
      ? normalized.toLowerCase()
      : normalized;
  })
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  @MaxLength(254)
  email?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @Transform(nullableText)
  @MaxLength(500, { message: 'Địa chỉ không được vượt quá 500 ký tự' })
  address?: string | null;
}

export class UpdateSupplierDto extends PartialType(CreateSupplierDto) {}
