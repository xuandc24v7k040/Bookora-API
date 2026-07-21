import { ApiProperty } from '@nestjs/swagger';
import { ProductMediaType } from '@/generated/prisma/client';

export class ProductMediaResponseDto {
  @ApiProperty({ format: 'ulid' })
  id!: string;

  @ApiProperty({ format: 'ulid' })
  productId!: string;

  @ApiProperty({ nullable: true, type: String, format: 'ulid' })
  variantId!: string | null;

  @ApiProperty({ enum: ProductMediaType })
  type!: ProductMediaType;

  @ApiProperty({ format: 'uri' })
  url!: string;

  @ApiProperty({ nullable: true, type: String })
  altText!: string | null;

  @ApiProperty()
  sortOrder!: number;

  @ApiProperty()
  isPrimary!: boolean;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class OptionValueImageResponseDto {
  @ApiProperty({ format: 'ulid' })
  id!: string;

  @ApiProperty()
  label!: string;

  @ApiProperty({ nullable: true, type: String, format: 'uri' })
  imageUrl!: string | null;
}
