import { ApiProperty } from '@nestjs/swagger';
export class PublisherResponseDto {
  @ApiProperty({ format: 'ulid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() usageCount!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}
