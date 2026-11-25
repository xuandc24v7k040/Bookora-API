import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsDefined,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  SupportTicketStatus,
  SupportTicketType,
  UserType,
} from '@/generated/prisma/client';

export class SupportMessageInputDto {
  @ApiPropertyOptional({ maxLength: 26 })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9A-HJKMNP-TV-Z]{26}$/)
  replyToMessageId?: string;
  @ApiProperty({ maxLength: 80 })
  @Matches(/^[a-zA-Z0-9_-]{8,80}$/)
  clientMessageId!: string;
  @ApiPropertyOptional({ maxLength: 4000 })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  text?: string;
  @ApiPropertyOptional({ type: [String], maxItems: 5 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(26, { each: true })
  attachmentIds?: string[];
}

export class SupportContextDto {
  @ApiProperty({ enum: SupportTicketType })
  @IsEnum(SupportTicketType)
  type!: SupportTicketType;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(26)
  branchId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(26)
  orderId?: string;
}

export class SupportCreateDto extends SupportContextDto {
  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  subject?: string;
  @ApiProperty({ type: SupportMessageInputDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => SupportMessageInputDto)
  message!: SupportMessageInputDto;
}

export class SupportUploadContextDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(26)
  ticketId?: string;
  @ApiPropertyOptional({ enum: SupportTicketType })
  @IsOptional()
  @IsEnum(SupportTicketType)
  type?: SupportTicketType;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(26)
  branchId?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(26)
  orderId?: string;
}

export class SupportListQueryDto {
  @ApiPropertyOptional({
    description: 'Lọc chính xác đơn hàng trong phạm vi được phép.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(26)
  orderId?: string;
  @ApiPropertyOptional({ enum: SupportTicketStatus })
  @IsOptional()
  @IsEnum(SupportTicketStatus)
  status?: SupportTicketStatus;
  @ApiPropertyOptional({ enum: SupportTicketType })
  @IsOptional()
  @IsEnum(SupportTicketType)
  type?: SupportTicketType;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(26)
  branchId?: string;
  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  query?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(180)
  cursor?: string;
  @ApiPropertyOptional({ default: 30, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 30;
}

export class SupportHistoryQueryDto {
  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  beforeSequence?: number;
  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  afterSequence?: number;
  @ApiPropertyOptional({ default: 30, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 30;
}

export class SupportReadDto {
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) lastReadSequence!: number;
}

export class SupportReassignDto {
  @ApiProperty() @IsString() @MaxLength(26) assigneeId!: string;
}

export class SupportAttachmentDto {
  @ApiProperty() id!: string;
  @ApiProperty() filename!: string;
  @ApiProperty() mimeType!: string;
  @ApiProperty() size!: number;
}

export class SupportReplySummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() senderName!: string;
  @ApiProperty({ type: String, nullable: true }) text!: string | null;
  @ApiProperty() attachmentCount!: number;
}

export class SupportMessageDto {
  @ApiPropertyOptional({ type: String, nullable: true })
  replyToMessageId?: string | null;
  @ApiPropertyOptional({ type: SupportReplySummaryDto, nullable: true })
  replyTo?: SupportReplySummaryDto | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  senderAvatarUrl?: string | null;
  @ApiProperty() id!: string;
  @ApiProperty() ticketId!: string;
  @ApiProperty() senderUserId!: string;
  @ApiProperty({ enum: UserType }) senderType!: UserType;
  @ApiProperty() senderName!: string;
  @ApiProperty() clientMessageId!: string;
  @ApiProperty({ type: String, nullable: true }) text!: string | null;
  @ApiProperty() sequence!: number;
  @ApiProperty() createdAt!: string;
  @ApiProperty({ type: [SupportAttachmentDto] })
  attachments!: SupportAttachmentDto[];
}

export class SupportTicketDto {
  @ApiPropertyOptional({ type: String, nullable: true })
  customerAvatarUrl?: string | null;
  @ApiProperty() id!: string;
  @ApiProperty() customerId!: string;
  @ApiProperty() customerName!: string;
  @ApiProperty() branchId!: string;
  @ApiProperty() branchName!: string;
  @ApiProperty({ enum: SupportTicketType }) type!: SupportTicketType;
  @ApiProperty({ type: String, nullable: true }) orderId!: string | null;
  @ApiProperty({ type: String, nullable: true }) orderCode!: string | null;
  @ApiProperty({ type: String, nullable: true }) subject!: string | null;
  @ApiProperty({ enum: SupportTicketStatus }) status!: SupportTicketStatus;
  @ApiProperty({ type: String, nullable: true }) assigneeId!: string | null;
  @ApiProperty({ type: String, nullable: true }) assigneeName!: string | null;
  @ApiProperty() version!: number;
  @ApiProperty() lastSequence!: number;
  @ApiProperty() lastReadSequence!: number;
  @ApiProperty() customerReadSequence!: number;
  @ApiProperty() assigneeReadSequence!: number;
  @ApiProperty() unreadCount!: number;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
  @ApiProperty({ type: String, nullable: true }) resolvedAt!: string | null;
  @ApiProperty({ type: SupportMessageDto, nullable: true })
  lastMessage!: SupportMessageDto | null;
}

export class SupportTicketListDto {
  @ApiProperty({ type: [SupportTicketDto] }) items!: SupportTicketDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}

export class SupportHistoryDto {
  @ApiProperty({ type: [SupportMessageDto] }) items!: SupportMessageDto[];
  @ApiProperty({ type: Number, nullable: true }) nextSequence!: number | null;
}

export class SupportSendResultDto {
  @ApiProperty() ticketId!: string;
  @ApiProperty({ type: SupportMessageDto }) message!: SupportMessageDto;
  @ApiProperty() replayed!: boolean;
}

export class SupportReadResultDto {
  @ApiProperty() ticketId!: string;
  @ApiProperty() lastReadSequence!: number;
}

export class SupportOrderContextDto {
  @ApiProperty() orderId!: string;
  @ApiProperty() orderCode!: string;
  @ApiProperty() branchId!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ type: String, nullable: true }) activeTicketId!: string | null;
  @ApiProperty() canViewOrderDetail!: boolean;
}

export class SupportActivityDto {
  @ApiProperty() id!: string;
  @ApiProperty() actorId!: string;
  @ApiProperty() action!: string;
  @ApiProperty({ type: String, nullable: true }) fromStatus!: string | null;
  @ApiProperty() toStatus!: string;
  @ApiProperty({ type: String, nullable: true }) fromAssigneeId!: string | null;
  @ApiProperty({ type: String, nullable: true }) toAssigneeId!: string | null;
  @ApiProperty() createdAt!: string;
}

export class SupportActivityListDto {
  @ApiProperty({ type: [SupportActivityDto] }) items!: SupportActivityDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}

export class SupportUnreadDto {
  @ApiProperty() unreadCount!: number;
}

export class SupportAssigneeQueryDto {
  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  query?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(26)
  cursor?: string;
}

export class SupportAssigneeDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}

export class SupportAssigneeListDto {
  @ApiProperty({ type: [SupportAssigneeDto] }) items!: SupportAssigneeDto[];
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}
