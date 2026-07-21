import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Length, Matches } from 'class-validator';
import { ProductAttributeType } from '@/generated/prisma/client';
import { MasterDataListQueryDto } from '@/common/dto/master-data-query.dto';
import {
  normalizeAttributeCode,
  normalizeMasterDataName,
} from '@/common/utils/master-data.util';
export enum ProductAttributeSortField {
  NAME = 'name',
  CODE = 'code',
  TYPE = 'type',
  USAGE_COUNT = 'usageCount',
  CREATED_AT = 'createdAt',
  UPDATED_AT = 'updatedAt',
}
export class ProductAttributeListQueryDto extends MasterDataListQueryDto {
  @ApiPropertyOptional({ enum: ProductAttributeSortField })
  @IsOptional()
  @IsEnum(ProductAttributeSortField)
  sortBy?: ProductAttributeSortField;
  @ApiPropertyOptional({ enum: ProductAttributeType })
  @IsOptional()
  @IsEnum(ProductAttributeType)
  type?: ProductAttributeType;
}
export class CreateProductAttributeDto {
  @ApiProperty({ minLength: 2, maxLength: 120 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeMasterDataName(value) : value,
  )
  @IsString({ message: 'Vui lòng nhập tên thuộc tính' })
  @Length(2, 120, { message: 'Tên thuộc tính phải từ 2 đến 120 ký tự' })
  name!: string;
  @ApiProperty({ example: 'LANGUAGE' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeAttributeCode(value) : value,
  )
  @IsString({ message: 'Vui lòng nhập mã thuộc tính' })
  @Length(2, 64, { message: 'Mã thuộc tính phải từ 2 đến 64 ký tự' })
  @Matches(/^[A-Z][A-Z0-9_]*$/, {
    message:
      'Mã thuộc tính phải bắt đầu bằng chữ cái và chỉ gồm chữ in hoa, số, dấu gạch dưới',
  })
  code!: string;
  @ApiProperty({ enum: ProductAttributeType })
  @IsEnum(ProductAttributeType, { message: 'Kiểu dữ liệu không hợp lệ' })
  type!: ProductAttributeType;
}
export class UpdateProductAttributeDto extends PartialType(
  CreateProductAttributeDto,
) {}
