import { ApiProperty } from '@nestjs/swagger';
import { CategoryType } from '@/generated/prisma/client';

export class CategorySummaryResponseDto {
  @ApiProperty({ format: 'ulid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true, type: String, format: 'ulid' })
  parentId!: string | null;

  @ApiProperty({ enum: CategoryType })
  type!: CategoryType;

  @ApiProperty()
  isActive!: boolean;
}

export class CategoryResponseDto {
  @ApiProperty({ format: 'ulid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiProperty({ nullable: true, type: String })
  description!: string | null;

  @ApiProperty({ nullable: true, type: String, format: 'ulid' })
  parentId!: string | null;

  @ApiProperty({ enum: CategoryType })
  type!: CategoryType;

  @ApiProperty({ nullable: true, type: String, format: 'uri' })
  imageUrl!: string | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  effectiveActive!: boolean;

  @ApiProperty()
  sortOrder!: number;

  @ApiProperty({ enum: [1, 2] })
  level!: 1 | 2;

  @ApiProperty()
  childrenCount!: number;

  @ApiProperty()
  productCount!: number;

  @ApiProperty({ nullable: true, type: CategorySummaryResponseDto })
  parent!: CategorySummaryResponseDto | null;

  @ApiProperty({ type: [CategorySummaryResponseDto] })
  children!: CategorySummaryResponseDto[];

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class CategoryTreeNodeResponseDto extends CategoryResponseDto {
  @ApiProperty({ type: () => [CategoryTreeNodeResponseDto] })
  declare children: CategoryTreeNodeResponseDto[];
}
