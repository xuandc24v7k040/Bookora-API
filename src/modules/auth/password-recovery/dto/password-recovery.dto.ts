import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const RESET_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).+$/;

export class ForgotPasswordDto {
  @ApiProperty({ format: 'email', maxLength: 254 })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiPropertyOptional({
    description:
      'Token Turnstile, bắt buộc khi Turnstile được bật trên server.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  turnstileToken?: string;
}

export class ValidateResetTokenDto {
  @ApiProperty({
    minLength: 43,
    maxLength: 43,
    pattern: RESET_TOKEN_PATTERN.source,
  })
  @IsString()
  @Matches(RESET_TOKEN_PATTERN)
  token!: string;
}

export class ResetPasswordDto extends ValidateResetTokenDto {
  @ApiProperty({
    format: 'password',
    minLength: 8,
    maxLength: 128,
    pattern: PASSWORD_PATTERN.source,
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(PASSWORD_PATTERN, {
    message: 'newPassword must contain at least one letter and one number',
  })
  newPassword!: string;
}

export class ForgotPasswordResponseDto {
  @ApiProperty({ example: true }) success!: boolean;
  @ApiProperty({
    example:
      'Nếu email tồn tại trong hệ thống, Bookora đã gửi hướng dẫn đặt lại mật khẩu.',
  })
  message!: string;
}

export class ValidateResetTokenResponseDto {
  @ApiProperty({ enum: ['VALID'], example: 'VALID' })
  status!: 'VALID';
}

export class ResetPasswordResponseDto {
  @ApiProperty({ example: true }) success!: boolean;
}
