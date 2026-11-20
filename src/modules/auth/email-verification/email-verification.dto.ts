import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Matches, MaxLength } from 'class-validator';
import { PublicAuthUserResponseDto } from '../dto/auth-response.dto';

export class VerifyEmailDto {
  @ApiProperty({ minLength: 43, maxLength: 43, pattern: '^[A-Za-z0-9_-]{43}$' })
  @IsString({ message: 'Liên kết xác minh không hợp lệ.' })
  @Matches(/^[A-Za-z0-9_-]{43}$/, {
    message: 'Liên kết xác minh không hợp lệ.',
  })
  token!: string;
}

export class ResendVerificationDto {
  @ApiProperty({ format: 'email', maxLength: 254 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Email không đúng định dạng.' })
  @MaxLength(254, { message: 'Email quá dài.' })
  email!: string;
}

export class RegistrationResponseDto extends PublicAuthUserResponseDto {
  @ApiProperty({ enum: [true] })
  verificationRequired!: boolean;

  @ApiProperty({ enum: ['SENT', 'FAILED'] })
  verificationDelivery!: 'SENT' | 'FAILED';

  @ApiProperty({ minimum: 1 })
  resendCooldownSeconds!: number;
}

export class ResendVerificationResponseDto {
  @ApiProperty()
  success!: boolean;

  @ApiProperty()
  message!: string;

  @ApiProperty({ minimum: 1 })
  resendCooldownSeconds!: number;
}
