import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { UserType } from '@/generated/prisma/client';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';
import { ImageUploadService } from '@/shared/images/image-upload.service';
import { R2ObjectStorageService } from '@/shared/storage/r2-object-storage.service';
import {
  ReviewMediaRepository,
  REVIEW_IMAGE_LIMIT,
} from './review-media.repository';

@Injectable()
export class ReviewMediaService {
  constructor(
    private readonly repository: ReviewMediaRepository,
    private readonly images: ImageUploadService,
    private readonly storage: R2ObjectStorageService,
  ) {}

  async upload(
    actor: AuthenticatedUser,
    reviewId: string,
    files: Express.Multer.File[],
  ) {
    this.assertCustomer(actor);
    const count = await this.repository.assertOwned(actor.id, reviewId);
    if (!files.length || files.length > REVIEW_IMAGE_LIMIT) {
      throw new BadRequestException({
        code: 'REVIEW_IMAGE_INVALID_FILE',
        message: 'Vui lòng chọn từ 1 đến 4 ảnh.',
      });
    }
    if (count + files.length > REVIEW_IMAGE_LIMIT) {
      throw new ConflictException({
        code: 'REVIEW_IMAGE_LIMIT_EXCEEDED',
        message: 'Mỗi đánh giá chỉ được có tối đa 4 ảnh.',
      });
    }
    const uploaded: Array<{ objectKey: string; url: string }> = [];
    try {
      for (const file of files) {
        const image = await this.images.upload({
          file,
          namespace: 'reviews',
          ownerId: reviewId,
          visibility: 'public',
          preset: 'review',
        });
        uploaded.push({ objectKey: image.key, url: image.url! });
      }
      return await this.repository.add(actor.id, reviewId, uploaded);
    } catch (error) {
      await this.cleanup(
        reviewId,
        uploaded.map((image) => image.objectKey),
        'upload-compensation',
      );
      throw error;
    }
  }

  async remove(actor: AuthenticatedUser, reviewId: string, mediaId: string) {
    this.assertCustomer(actor);
    const key = await this.repository.remove(actor.id, reviewId, mediaId);
    await this.cleanup(reviewId, [key], 'image-delete');
    return { id: mediaId };
  }

  deleteReview(userId: string, reviewId: string) {
    return this.repository.deleteReview(userId, reviewId);
  }

  cleanup(reviewId: string, keys: readonly string[], operation: string) {
    return this.storage.cleanupKeys(keys, `reviews/${reviewId}/`, operation);
  }

  private assertCustomer(actor: AuthenticatedUser) {
    if (actor.type !== UserType.CUSTOMER)
      throw new ForbiddenException({
        code: 'REVIEW_NOT_ELIGIBLE',
        message: 'Chỉ khách hàng được quản lý ảnh đánh giá.',
      });
  }
}
