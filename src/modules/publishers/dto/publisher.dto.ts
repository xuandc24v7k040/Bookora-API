import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { MasterDataListQueryDto } from '@/common/dto/master-data-query.dto';
import { normalizeMasterDataName } from '@/common/utils/master-data.util';

export enum PublisherSortField {
  NAME = 'name',
  USAGE_COUNT = 'usageCount',
  CREATED_AT = 'createdAt',
  UPDATED_AT = 'updatedAt',
}
export class PublisherListQueryDto extends MasterDataListQueryDto {
  @ApiPropertyOptional({ enum: PublisherSortField })
  @IsOptional()
  @IsEnum(PublisherSortField)
  sortBy?: PublisherSortField;
}
export class CreatePublisherDto {
  @ApiProperty({ minLength: 2, maxLength: 120 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeMasterDataName(value) : value,
  )
  @IsString({ message: 'Vui lòng nhập tên nhà xuất bản' })
  @Length(2, 120, { message: 'Tên nhà xuất bản phải từ 2 đến 120 ký tự' })
  name!: string;
}
export class UpdatePublisherDto extends PartialType(CreatePublisherDto) {}
