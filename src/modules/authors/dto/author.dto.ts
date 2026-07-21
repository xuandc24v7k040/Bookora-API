import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { MasterDataListQueryDto } from '@/common/dto/master-data-query.dto';
import { normalizeMasterDataName } from '@/common/utils/master-data.util';
export enum AuthorSortField {
  NAME = 'name',
  USAGE_COUNT = 'usageCount',
  CREATED_AT = 'createdAt',
  UPDATED_AT = 'updatedAt',
}
export class AuthorListQueryDto extends MasterDataListQueryDto {
  @ApiPropertyOptional({ enum: AuthorSortField })
  @IsOptional()
  @IsEnum(AuthorSortField)
  sortBy?: AuthorSortField;
}
export class CreateAuthorDto {
  @ApiProperty({ minLength: 2, maxLength: 120 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeMasterDataName(value) : value,
  )
  @IsString({ message: 'Vui lòng nhập tên tác giả' })
  @Length(2, 120, { message: 'Tên tác giả phải từ 2 đến 120 ký tự' })
  name!: string;
}
export class UpdateAuthorDto extends PartialType(CreateAuthorDto) {}
