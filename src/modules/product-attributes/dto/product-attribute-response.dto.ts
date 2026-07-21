import { ApiProperty } from '@nestjs/swagger';
import { ProductAttributeType } from '@/generated/prisma/client';
export class ProductAttributeResponseDto {
  @ApiProperty({ format: 'ulid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() code!: string;
  @ApiProperty({ enum: ProductAttributeType }) type!: ProductAttributeType;
  @ApiProperty() usageCount!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}
