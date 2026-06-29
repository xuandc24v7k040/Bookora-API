import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({
    type: String,
    format: 'email',
    example: 'customer@example.com',
    description: 'Email dùng để đăng ký tài khoản.',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    type: String,
    minLength: 2,
    example: 'Nguyen Van A',
    description: 'Họ tên hiển thị của user. Tối thiểu 2 ký tự.',
  })
  @IsString()
  @MinLength(2)
  fullName!: string;

  @ApiProperty({
    type: String,
    format: 'password',
    minLength: 8,
    pattern: '^(?=.*[A-Za-z])(?=.*\\d).+$',
    example: 'Password1',
    description:
      'Mật khẩu đăng ký. Tối thiểu 8 ký tự và phải có ít nhất một chữ cái cùng một chữ số.',
  })
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'password must contain at least one letter and one number',
  })
  password!: string;

  @ApiPropertyOptional({
    type: String,
    example: '0.M4AA-example-turnstile-token',
    description:
      'Token lấy từ Cloudflare Turnstile widget trên frontend. Trường này là optional ở schema, nhưng bắt buộc khi Turnstile được bật trên server.',
  })
  @IsOptional()
  @IsString()
  turnstileToken?: string;
}
