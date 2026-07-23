import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CustomerAddressResponseDto } from '@/modules/customer-addresses/dto';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).+$/;
const PHONE_PATTERN = /^(?:0\d{9}|\+84\d{9})$/;
const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export class UpdateCustomerProfileDto {
  @ApiPropertyOptional({ minLength: 2, maxLength: 100 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName?: string;

  @ApiPropertyOptional({ nullable: true, example: '0901234567' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || null : value,
  )
  @Matches(PHONE_PATTERN)
  phone?: string | null;

  @ApiPropertyOptional({ nullable: true, enum: ['male', 'female', 'other'] })
  @IsOptional()
  @IsIn(['male', 'female', 'other', null])
  gender?: 'male' | 'female' | 'other' | null;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'date' })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(DATE_ONLY_PATTERN)
  birthday?: string | null;

  @ApiPropertyOptional({
    description: 'Địa chỉ mặc định thuộc tài khoản hiện tại.',
  })
  @IsOptional()
  @Matches(ULID_PATTERN)
  defaultAddressId?: string;
}

export class ChangeCustomerPasswordDto {
  @ApiProperty({ format: 'password' })
  @IsString()
  currentPassword!: string;

  @ApiProperty({
    format: 'password',
    minLength: 8,
    pattern: PASSWORD_PATTERN.source,
  })
  @IsString()
  @MinLength(8)
  @Matches(PASSWORD_PATTERN)
  newPassword!: string;
}

export class CustomerProfileResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty({ format: 'email', readOnly: true }) email!: string;
  @ApiProperty({ nullable: true, type: String }) phone!: string | null;
  @ApiProperty({ nullable: true, type: String }) gender!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date' }) birthday!:
    | string
    | null;
  @ApiProperty({ nullable: true, type: String }) avatarUrl!: string | null;
  @ApiProperty() provider!: string;
  @ApiProperty() hasLocalPassword!: boolean;
  @ApiProperty({ nullable: true, type: CustomerAddressResponseDto })
  defaultAddress!: CustomerAddressResponseDto | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

export class CustomerPasswordChangedResponseDto {
  @ApiProperty({ example: true }) success!: boolean;
}
