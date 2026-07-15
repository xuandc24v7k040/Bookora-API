import { ApiProperty } from '@nestjs/swagger';
import { AuthProvider, UserType } from '@/generated/prisma/client';

export class UserResponseDto {
  @ApiProperty({ example: '01JVCY8VZ10XWBQ9M3B0EG9D7K' })
  id!: string;

  @ApiProperty({ example: 'admin@example.com' })
  email!: string;

  @ApiProperty({ example: 'Admin', nullable: true, type: String })
  fullName!: string | null;

  @ApiProperty({ example: '0900000000', nullable: true, type: String })
  phone!: string | null;

  @ApiProperty({ example: 'female', nullable: true, type: String })
  gender!: string | null;

  @ApiProperty({
    example: '1995-08-17',
    nullable: true,
    type: String,
    format: 'date',
  })
  birthday!: string | null;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ enum: UserType, example: UserType.CUSTOMER })
  type!: UserType;

  @ApiProperty({ enum: AuthProvider, example: AuthProvider.LOCAL })
  provider!: AuthProvider;

  @ApiProperty({
    example: '2026-06-21T00:00:00.000Z',
    nullable: true,
    type: String,
  })
  lastLoginAt!: string | null;

  @ApiProperty({ example: '2026-05-13T00:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-05-13T00:00:00.000Z' })
  updatedAt!: string;
}
