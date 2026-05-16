import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty({ example: '663b7f1f8a56b1d9fc45a001' })
  _id!: string;

  @ApiProperty({ example: 'admin@example.com' })
  email!: string;

  @ApiProperty({ example: 'Admin' })
  fullName!: string;

  @ApiPropertyOptional({ example: '0900000000' })
  phone?: string;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ example: '2026-05-13T00:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-05-13T00:00:00.000Z' })
  updatedAt!: string;
}
