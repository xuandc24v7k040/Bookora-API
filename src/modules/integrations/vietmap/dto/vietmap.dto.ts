import { Type } from 'class-transformer';
import {
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VietMapReverseQueryDto {
  @ApiProperty({ example: 10.0452, minimum: -90, maximum: 90 })
  @Type(() => Number)
  @IsNumber()
  @IsLatitude()
  latitude!: number;

  @ApiProperty({ example: 105.7469, minimum: -180, maximum: 180 })
  @Type(() => Number)
  @IsNumber()
  @IsLongitude()
  longitude!: number;
}

export class VietMapAutocompleteQueryDto {
  @ApiProperty({ minLength: 2, maxLength: 200, example: 'Đường 30 tháng 4' })
  @IsString()
  @Length(2, 200)
  text!: string;

  @ApiPropertyOptional({ example: 10.0452, minimum: -90, maximum: 90 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsLatitude()
  focusLatitude?: number;

  @ApiPropertyOptional({ example: 105.7469, minimum: -180, maximum: 180 })
  @ValidateIf(
    (query: VietMapAutocompleteQueryDto) =>
      query.focusLatitude !== undefined || query.focusLongitude !== undefined,
  )
  @Type(() => Number)
  @IsNumber()
  @IsLongitude()
  focusLongitude?: number;
}

export class VietMapPlaceQueryDto {
  @ApiProperty({ minLength: 1, maxLength: 2048 })
  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  reference!: string;
}

export class VietMapLocationResponseDto {
  @ApiProperty({ example: 10.0452 }) latitude!: number;
  @ApiProperty({ example: 105.7469 }) longitude!: number;
  @ApiProperty({ nullable: true, type: String, example: 'VN' })
  countryCode!: string | null;
  @ApiProperty({ nullable: true, type: String, example: 'Thành phố Cần Thơ' })
  province!: string | null;
  @ApiProperty({ nullable: true, type: String, example: 'Quận Ninh Kiều' })
  district!: string | null;
  @ApiProperty({ nullable: true, type: String, example: 'Phường Ninh Kiều' })
  ward!: string | null;
  @ApiProperty({ example: '12 Đường 30 tháng 4' }) address!: string;
  @ApiProperty({
    example: '12 Đường 30 tháng 4, Phường Ninh Kiều, Thành phố Cần Thơ',
  })
  displayAddress!: string;
}

export class VietMapSuggestionResponseDto {
  @ApiProperty() refId!: string;
  @ApiProperty() displayAddress!: string;
}
