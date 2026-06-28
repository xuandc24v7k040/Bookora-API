import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty({ example: '01JVCY8VZ10XWBQ9M3B0EG9D7K' })
  id!: string;

  @ApiProperty({ example: 'admin@example.com' })
  email!: string;

  @ApiProperty({ example: 'Admin' })
  fullName!: string;

  @ApiPropertyOptional({ example: '0900000000' })
  phone?: string;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ enum: ['SYSTEM', 'BRANCH', 'CUSTOMER'], example: 'CUSTOMER' })
  type!: 'SYSTEM' | 'BRANCH' | 'CUSTOMER';

  @ApiPropertyOptional({ example: '2026-06-21T00:00:00.000Z' })
  lastLoginAt?: string;

  @ApiProperty({ example: '2026-05-13T00:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-05-13T00:00:00.000Z' })
  updatedAt!: string;
}
