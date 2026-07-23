import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StorefrontBranchResponseDto {
  @ApiProperty({ format: 'ulid' })
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  address!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  province!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  ward!: string | null;
}
