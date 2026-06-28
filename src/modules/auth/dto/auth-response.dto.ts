import { ApiProperty } from '@nestjs/swagger';
import { UserType } from '@/generated/prisma/client';

export class PublicAuthUserResponseDto {
  @ApiProperty({ example: '01JY7M9M9Z4Y7Y7K7QZJ9Y4S4T' })
  id!: string;

  @ApiProperty({ format: 'email', example: 'customer@example.com' })
  email!: string;

  @ApiProperty({ example: 'Nguyen Van A' })
  fullName!: string;

  @ApiProperty({
    enum: UserType,
    enumName: 'UserType',
    example: UserType.CUSTOMER,
  })
  type!: UserType;
}

export class AuthMutationResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;
}

export class CsrfTokenResponseDto {
  @ApiProperty({
    example: '8f1f0d6c2ad34f6a9bb20b2ca3fc2a4f2c8873cfd5c5fb22ad91bc70ed9a6aa2',
  })
  csrfToken!: string;
}
