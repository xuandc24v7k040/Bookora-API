import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { AuthProvider, UserType } from '@/generated/prisma/client';
import { PaginationDto } from '../../../common/dto';
import { SortDirection } from '../../../common/enums';

export enum UsersSortField {
  CREATED_AT = 'createdAt',
  UPDATED_AT = 'updatedAt',
  EMAIL = 'email',
  FULL_NAME = 'fullName',
  PHONE = 'phone',
  TYPE = 'type',
  PROVIDER = 'provider',
  IS_ACTIVE = 'isActive',
  LAST_LOGIN_AT = 'lastLoginAt',
}

export class UsersQueryDto extends PaginationDto {
  @ApiPropertyOptional({ example: 'admin' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: UsersSortField })
  @IsOptional()
  @IsEnum(UsersSortField)
  sortBy?: UsersSortField;

  @ApiPropertyOptional({ enum: SortDirection })
  @IsOptional()
  @IsEnum(SortDirection)
  sortOrder?: SortDirection;

  @ApiPropertyOptional({ enum: UserType })
  @IsOptional()
  @IsEnum(UserType)
  type?: UserType;

  @ApiPropertyOptional({ enum: AuthProvider })
  @IsOptional()
  @IsEnum(AuthProvider)
  provider?: AuthProvider;

  @ApiPropertyOptional({ type: Boolean, example: true })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  isActive?: boolean;
}
