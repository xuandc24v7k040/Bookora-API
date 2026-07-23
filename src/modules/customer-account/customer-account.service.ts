import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AuthProvider,
  UserType,
  type UserAddress,
} from '@/generated/prisma/client';
import type { Response } from 'express';
import { AuthService } from '@/modules/auth/auth.service';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';
import { ImageUploadService } from '@/shared/images/image-upload.service';
import { R2ObjectStorageService } from '@/shared/storage/r2-object-storage.service';
import { CustomerAccountRepository } from './customer-account.repository';
import type {
  ChangeCustomerPasswordDto,
  UpdateCustomerProfileDto,
} from './dto';

@Injectable()
export class CustomerAccountService {
  private readonly logger = new Logger(CustomerAccountService.name);

  constructor(
    private readonly repository: CustomerAccountRepository,
    private readonly authService: AuthService,
    private readonly imageUpload: ImageUploadService,
    private readonly storage: R2ObjectStorageService,
  ) {}

  async profile(actor: AuthenticatedUser) {
    this.assertCustomer(actor);
    const profile = await this.repository.findProfile(actor.id);
    if (!profile) this.notFound();
    return this.toResponse(profile);
  }

  async updateProfile(actor: AuthenticatedUser, dto: UpdateCustomerProfileDto) {
    this.assertCustomer(actor);
    if (
      dto.birthday &&
      new Date(`${dto.birthday}T00:00:00.000Z`) > new Date()
    ) {
      throw new BadRequestException({
        code: 'CUSTOMER_BIRTHDAY_IN_FUTURE',
        message: 'Ngày sinh không được nằm trong tương lai',
      });
    }
    const updated = await this.repository.updateProfile(
      actor.id,
      {
        ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.gender !== undefined ? { gender: dto.gender } : {}),
        ...(dto.birthday !== undefined
          ? {
              birthday:
                dto.birthday === null
                  ? null
                  : new Date(`${dto.birthday}T00:00:00.000Z`),
            }
          : {}),
      },
      dto.defaultAddressId,
    );
    if (!updated) {
      throw new BadRequestException({
        code: 'CUSTOMER_DEFAULT_ADDRESS_INVALID',
        message:
          'Địa chỉ mặc định không còn tồn tại hoặc không thuộc tài khoản của bạn',
      });
    }
    return this.toResponse(updated);
  }

  async uploadAvatar(actor: AuthenticatedUser, file: Express.Multer.File) {
    this.assertCustomer(actor);
    const current = await this.repository.findProfile(actor.id);
    if (!current) this.notFound();
    const uploaded = await this.imageUpload.upload({
      file,
      namespace: 'avatars',
      ownerId: actor.id,
      visibility: 'public',
      preset: 'avatar',
    });
    try {
      const updated = await this.repository.updateAvatar(
        actor.id,
        uploaded.url,
      );
      await this.cleanupPublicImage(current.avatarUrl, 'replace-old');
      return this.toResponse(updated);
    } catch (error) {
      await this.cleanupKey(uploaded.key, 'replace-compensation');
      throw error;
    }
  }

  async removeAvatar(actor: AuthenticatedUser) {
    this.assertCustomer(actor);
    const current = await this.repository.findProfile(actor.id);
    if (!current) this.notFound();
    if (!current.avatarUrl) return this.toResponse(current);
    const updated = await this.repository.updateAvatar(actor.id, null);
    await this.cleanupPublicImage(current.avatarUrl, 'remove');
    return this.toResponse(updated);
  }

  async changePassword(
    actor: AuthenticatedUser,
    dto: ChangeCustomerPasswordDto,
    response: Response,
  ) {
    this.assertCustomer(actor);
    return this.authService.changePassword(actor, dto, response);
  }

  private toResponse(
    profile: NonNullable<
      Awaited<ReturnType<CustomerAccountRepository['findProfile']>>
    >,
  ) {
    const address = profile.addresses[0] ?? null;
    return {
      id: profile.id,
      fullName: profile.fullName ?? '',
      email: profile.email,
      phone: profile.phone,
      gender: profile.gender,
      birthday: profile.birthday?.toISOString().slice(0, 10) ?? null,
      avatarUrl: profile.avatarUrl,
      provider: profile.provider,
      hasLocalPassword:
        profile.provider === AuthProvider.LOCAL &&
        Boolean(profile.passwordHash),
      defaultAddress: address ? this.toAddressResponse(address) : null,
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
    };
  }

  private toAddressResponse(address: UserAddress) {
    return {
      id: address.id,
      label: address.label,
      recipientName: address.receiverName,
      phone: address.receiverPhone,
      provinceCode: address.provinceCode,
      provinceName: address.province,
      wardCode: address.wardCode,
      wardName: address.ward,
      addressDetail: address.detail,
      formattedAddress: [address.detail, address.ward, address.province].join(
        ', ',
      ),
      isDefault: address.isDefault,
      createdAt: address.createdAt.toISOString(),
      updatedAt: address.updatedAt.toISOString(),
    };
  }

  private assertCustomer(actor: AuthenticatedUser) {
    if (actor.type !== UserType.CUSTOMER) {
      throw new ForbiddenException(
        'Chỉ khách hàng được truy cập hồ sơ cá nhân',
      );
    }
  }

  private notFound(): never {
    throw new NotFoundException({
      code: 'CUSTOMER_PROFILE_NOT_FOUND',
      message: 'Không tìm thấy hồ sơ khách hàng',
    });
  }

  private async cleanupPublicImage(url: string | null, operation: string) {
    if (!url) return;
    const key = this.storage.extractPublicKey(url);
    if (!key || !key.startsWith('avatars/')) {
      this.logger.warn(
        `Skip avatar cleanup operation=${operation} reason=untrusted-url`,
      );
      return;
    }
    await this.cleanupKey(key, operation);
  }

  private async cleanupKey(key: string, operation: string) {
    try {
      await this.storage.delete({ visibility: 'public', key });
    } catch (error) {
      this.logger.error(
        `Avatar cleanup failed operation=${operation} key=${key} error=${error instanceof Error ? error.name : 'UnknownError'}`,
      );
    }
  }
}
