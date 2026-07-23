import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const PHONE_PATTERN = /^(?:0\d{9}|\+84\d{9})$/;

export class CreateCustomerAddressDto {
  @ApiPropertyOptional({ type: String, example: 'Nhà' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || null : value,
  )
  @IsString()
  @MaxLength(50)
  label?: string;

  @ApiProperty({ example: 'Nguyễn Văn A', minLength: 2, maxLength: 100 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  recipientName!: string;

  @ApiProperty({ example: '0901234567' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Matches(PHONE_PATTERN)
  phone!: string;

  @ApiProperty({ type: Number, example: 92 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  provinceCode!: number;

  @ApiProperty({ type: Number, example: 31117 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  wardCode!: number;

  @ApiProperty({
    example: '31A đường Phạm Văn Nhờ',
    minLength: 5,
    maxLength: 255,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(5)
  @MaxLength(255)
  addressDetail!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateCustomerAddressDto extends PartialType(
  CreateCustomerAddressDto,
) {}

export class CustomerAddressResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ nullable: true, type: String }) label!: string | null;
  @ApiProperty() recipientName!: string;
  @ApiProperty() phone!: string;
  @ApiProperty() provinceCode!: number;
  @ApiProperty() provinceName!: string;
  @ApiProperty() wardCode!: number;
  @ApiProperty() wardName!: string;
  @ApiProperty() addressDetail!: string;
  @ApiProperty() formattedAddress!: string;
  @ApiProperty() isDefault!: boolean;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

export class CustomerAddressDeleteResponseDto {
  @ApiProperty() deletedAddressId!: string;
  @ApiProperty({ nullable: true, type: CustomerAddressResponseDto })
  defaultAddress!: CustomerAddressResponseDto | null;
}
