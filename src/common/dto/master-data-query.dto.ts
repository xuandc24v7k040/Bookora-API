import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  Validate,
  ValidateBy,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { PaginationDto } from './pagination.dto';
import { SortDirection } from '../enums';

export enum UsageStatus {
  USED = 'USED',
  UNUSED = 'UNUSED',
}

function isCalendarDate(value: unknown): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const [year, month, day] = value.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

const IsCalendarDate = (message: string) =>
  ValidateBy({
    name: 'isCalendarDate',
    validator: { validate: isCalendarDate, defaultMessage: () => message },
  });

@ValidatorConstraint({ name: 'masterDataDateRange', async: false })
class MasterDataDateRangeConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments): boolean {
    const value = args.object as MasterDataListQueryDto;
    return (
      !value.createdFrom ||
      !value.createdTo ||
      value.createdFrom <= value.createdTo
    );
  }

  defaultMessage(): string {
    return 'Ngày bắt đầu không được sau ngày kết thúc';
  }
}

export class MasterDataListQueryDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: UsageStatus })
  @IsOptional()
  @IsEnum(UsageStatus)
  usageStatus?: UsageStatus;

  @ApiPropertyOptional({ example: '2026-07-01' })
  @IsOptional()
  @IsCalendarDate('Ngày bắt đầu không hợp lệ')
  createdFrom?: string;

  @ApiPropertyOptional({ example: '2026-07-31' })
  @IsOptional()
  @IsCalendarDate('Ngày kết thúc không hợp lệ')
  @Validate(MasterDataDateRangeConstraint)
  createdTo?: string;

  @ApiPropertyOptional({ enum: SortDirection })
  @IsOptional()
  @IsEnum(SortDirection)
  sortOrder?: SortDirection;
}
