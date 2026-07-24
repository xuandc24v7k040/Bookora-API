import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import {
  DeliveryAddressSource,
  PaymentMethod,
} from '@/generated/prisma/client';

const PHONE_PATTERN = /^(?:0\d{9}|\+84\d{9})$/;

export class SavedAddressInputDto {
  @ApiProperty({ enum: [DeliveryAddressSource.SAVED_ADDRESS] })
  @Equals(DeliveryAddressSource.SAVED_ADDRESS)
  source!: typeof DeliveryAddressSource.SAVED_ADDRESS;

  @ApiProperty({ format: 'ulid' })
  @IsString()
  customerAddressId!: string;
}

export class CurrentLocationAddressDto {
  @ApiProperty({ enum: [DeliveryAddressSource.CURRENT_LOCATION] })
  @Equals(DeliveryAddressSource.CURRENT_LOCATION)
  source!: typeof DeliveryAddressSource.CURRENT_LOCATION;

  @ApiProperty({ minLength: 2, maxLength: 100 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  receiverName!: string;

  @ApiProperty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Matches(PHONE_PATTERN, {
    message: 'Số điện thoại người nhận không hợp lệ.',
  })
  receiverPhone!: string;

  @ApiProperty({ minLength: 5, maxLength: 255 })
  @IsString()
  @MinLength(5)
  @MaxLength(255)
  addressLine!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  provinceName!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  provinceCode!: number;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  wardName!: string;

  @ApiProperty({ minimum: -90, maximum: 90 })
  @Type(() => Number)
  @IsLatitude()
  latitude!: number;

  @ApiProperty({ minimum: -180, maximum: 180 })
  @Type(() => Number)
  @IsLongitude()
  longitude!: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000)
  locationAccuracyMeters?: number;

  @ApiPropertyOptional({ enum: ['VIETMAP'] })
  @IsOptional()
  @IsString()
  locationProvider?: 'VIETMAP';

  @ApiPropertyOptional({ maxLength: 2048 })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  locationPlaceId?: string;
}

export class CurrentLocationResolveDto {
  @ApiProperty({ minimum: -90, maximum: 90 })
  @Type(() => Number)
  @IsLatitude()
  latitude!: number;

  @ApiProperty({ minimum: -180, maximum: 180 })
  @Type(() => Number)
  @IsLongitude()
  longitude!: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000)
  accuracyMeters?: number;
}

@ApiExtraModels(SavedAddressInputDto, CurrentLocationAddressDto)
export class PreviewCheckoutDto {
  @ApiProperty({ type: [String], minItems: 1, maxItems: 50, format: 'ulid' })
  @IsArray()
  @ArrayMinSize(1, {
    message: 'Vui lòng chọn ít nhất một sản phẩm hợp lệ.',
  })
  @ArrayMaxSize(50)
  @IsString({ each: true })
  selectedCartItemIds!: string[];

  @ApiPropertyOptional({
    oneOf: [
      { $ref: '#/components/schemas/SavedAddressInputDto' },
      { $ref: '#/components/schemas/CurrentLocationAddressDto' },
    ],
    discriminator: { propertyName: 'source' },
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => Object, {
    discriminator: {
      property: 'source',
      subTypes: [
        {
          name: DeliveryAddressSource.SAVED_ADDRESS,
          value: SavedAddressInputDto,
        },
        {
          name: DeliveryAddressSource.CURRENT_LOCATION,
          value: CurrentLocationAddressDto,
        },
      ],
    },
    keepDiscriminatorProperty: true,
  })
  address?: SavedAddressInputDto | CurrentLocationAddressDto;

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200, {
    message: 'Ghi chú không được vượt quá 200 ký tự.',
  })
  note?: string;
}

export class PlaceOrderDto extends PreviewCheckoutDto {
  @ApiProperty({ minLength: 8, maxLength: 100 })
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  idempotencyKey!: string;

  @ApiProperty({ minLength: 64, maxLength: 64 })
  @IsString()
  @MinLength(64)
  @MaxLength(64)
  previewReference!: string;
}

export class CheckoutBranchResponseDto {
  @ApiProperty({ format: 'ulid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() address!: string;
  @ApiProperty({ nullable: true, type: String }) province!: string | null;
  @ApiProperty({ nullable: true, type: String }) ward!: string | null;
}

export class CheckoutVariantOptionDto {
  @ApiProperty() name!: string;
  @ApiProperty() value!: string;
}

export class CheckoutItemResponseDto {
  @ApiProperty({ format: 'ulid' }) id!: string;
  @ApiProperty({ format: 'ulid' }) cartItemId!: string;
  @ApiProperty({ format: 'ulid' }) variantId!: string;
  @ApiProperty() productName!: string;
  @ApiProperty() productSlug!: string;
  @ApiProperty() variantLabel!: string;
  @ApiProperty({ type: [CheckoutVariantOptionDto] })
  variantOptions!: CheckoutVariantOptionDto[];
  @ApiProperty({ nullable: true, type: String }) imageUrl!: string | null;
  @ApiProperty() quantity!: number;
  @ApiProperty() availableQuantity!: number;
  @ApiProperty() unitPrice!: number;
  @ApiProperty() originalPrice!: number;
  @ApiProperty() discountAmount!: number;
  @ApiProperty() lineTotal!: number;
  @ApiProperty() isCheckoutEligible!: boolean;
  @ApiProperty({ type: [String] }) issues!: string[];
  @ApiProperty() eligible!: boolean;
  @ApiProperty({ nullable: true, type: String })
  reasonCode!: string | null;
  @ApiProperty({ nullable: true, type: String })
  reasonMessage!: string | null;
}

export class CheckoutAddressResponseDto {
  @ApiProperty({ enum: DeliveryAddressSource, nullable: true })
  source!: DeliveryAddressSource | null;
  @ApiProperty({ type: String, format: 'ulid', nullable: true })
  sourceCustomerAddressId!: string | null;
  @ApiProperty({ nullable: true, type: String }) receiverName!: string | null;
  @ApiProperty({ nullable: true, type: String }) receiverPhone!: string | null;
  @ApiProperty({ nullable: true, type: String })
  formattedAddress!: string | null;
  @ApiProperty({ nullable: true, type: Number }) latitude!: number | null;
  @ApiProperty({ nullable: true, type: Number }) longitude!: number | null;
  @ApiProperty() isGhnMapped!: boolean;
}

export class ShippingQuoteResponseDto {
  @ApiProperty() provider!: string;
  @ApiProperty() serviceId!: number;
  @ApiProperty() serviceTypeId!: number;
  @ApiProperty() serviceName!: string;
  @ApiProperty() shippingFee!: number;
  @ApiProperty() serviceFee!: number;
  @ApiProperty() insuranceFee!: number;
  @ApiProperty() codFee!: number;
  @ApiProperty() remoteAreaFee!: number;
  @ApiProperty({ format: 'date-time' }) quotedAt!: string;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
  @ApiProperty() requestFingerprint!: string;
  @ApiProperty({
    enum: ['SAME_PROVINCE', 'SAME_REGION', 'ADJACENT_REGION', 'FAR_REGION'],
  })
  shippingFeeRule!:
    | 'SAME_PROVINCE'
    | 'SAME_REGION'
    | 'ADJACENT_REGION'
    | 'FAR_REGION';
}

export class CheckoutPreviewResponseDto {
  @ApiProperty({ minLength: 64, maxLength: 64 })
  previewReference!: string;
  @ApiProperty({ type: CheckoutBranchResponseDto })
  branch!: CheckoutBranchResponseDto;
  @ApiProperty({ type: [CheckoutItemResponseDto] })
  items!: CheckoutItemResponseDto[];
  @ApiProperty({ type: CheckoutAddressResponseDto })
  address!: CheckoutAddressResponseDto;
  @ApiProperty({ type: ShippingQuoteResponseDto, nullable: true })
  shippingQuote!: ShippingQuoteResponseDto | null;
  @ApiProperty({ enum: PaymentMethod, nullable: true })
  paymentMethod!: PaymentMethod | null;
  @ApiProperty() subtotalAmount!: number;
  @ApiProperty() discountAmount!: number;
  @ApiProperty({ nullable: true, type: Number }) shippingFee!: number | null;
  @ApiProperty({
    enum: ['SAME_PROVINCE', 'SAME_REGION', 'ADJACENT_REGION', 'FAR_REGION'],
    nullable: true,
  })
  shippingFeeRule!:
    | 'SAME_PROVINCE'
    | 'SAME_REGION'
    | 'ADJACENT_REGION'
    | 'FAR_REGION'
    | null;
  @ApiProperty({ enum: ['STANDARD'] })
  shippingMethodCode!: 'STANDARD';
  @ApiProperty({ enum: ['GHN'] })
  shippingProviderCode!: 'GHN';
  @ApiProperty() totalAmount!: number;
  @ApiProperty({ nullable: true, type: String }) note!: string | null;
  @ApiProperty() canPlaceOrder!: boolean;
  @ApiProperty({ type: [String] }) blockingIssues!: string[];
}

export class CurrentLocationSuggestionDto {
  @ApiProperty() latitude!: number;
  @ApiProperty() longitude!: number;
  @ApiProperty({ nullable: true, type: String }) province!: string | null;
  @ApiProperty({ nullable: true, type: Number }) provinceCode!: number | null;
  @ApiProperty({ nullable: true, type: String }) ward!: string | null;
  @ApiProperty() address!: string;
  @ApiProperty() displayAddress!: string;
  @ApiProperty({ nullable: true, type: String }) placeId!: string | null;
  @ApiProperty({ nullable: true, type: Number })
  accuracyMeters!: number | null;
}

export class CurrentLocationReverseResponseDto {
  @ApiProperty() latitude!: number;
  @ApiProperty() longitude!: number;
  @ApiProperty() province!: string;
  @ApiProperty() provinceCode!: number;
  @ApiProperty() ward!: string;
  @ApiProperty() address!: string;
  @ApiProperty() displayAddress!: string;
  @ApiProperty({ nullable: true, type: String }) placeId!: string | null;
}

export class PlaceOrderResponseDto {
  @ApiProperty({ format: 'ulid' }) orderId!: string;
  @ApiProperty() orderCode!: string;
  @ApiProperty() paymentStatus!: string;
  @ApiProperty() orderStatus!: string;
}

export class VnpayPlaceOrderResponseDto extends PlaceOrderResponseDto {
  @ApiProperty({ format: 'ulid' }) paymentId!: string;
  @ApiProperty({ format: 'ulid' }) paymentTransactionId!: string;
  @ApiProperty({ format: 'uri' }) paymentUrl!: string;
}
