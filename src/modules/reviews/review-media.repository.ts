import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import type { Prisma } from '@/generated/prisma/client';
import { reviewMediaOrder } from './review-display';

export const REVIEW_IMAGE_LIMIT = 4;

@Injectable()
export class ReviewMediaRepository {
  constructor(private readonly prisma: PrismaService) {}

  async assertOwned(userId: string, reviewId: string) {
    const review = await this.prisma.review.findFirst({
      where: { id: reviewId, userId },
      select: { id: true, _count: { select: { media: true } } },
    });
    if (!review) this.notFound();
    return review._count.media;
  }

  private async locked<T>(
    userId: string,
    reviewId: string,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    // All media writes and review deletion acquire the same parent-row lock.
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM reviews WHERE id = ${reviewId} AND user_id = ${userId} FOR UPDATE
      `;
      if (rows.length !== 1) this.notFound();
      return work(tx);
    });
  }

  add(
    userId: string,
    reviewId: string,
    images: Array<{ objectKey: string; url: string }>,
  ) {
    return this.locked(userId, reviewId, async (tx) => {
      const stored = await tx.reviewMedia.findMany({
        where: { reviewId },
        select: { sortOrder: true },
      });
      if (stored.length + images.length > REVIEW_IMAGE_LIMIT) {
        throw new ConflictException({
          code: 'REVIEW_IMAGE_LIMIT_EXCEEDED',
          message: 'Mỗi đánh giá chỉ được có tối đa 4 ảnh.',
        });
      }
      const occupied = new Set(stored.map((image) => image.sortOrder));
      for (const image of images) {
        const slot = [0, 1, 2, 3].find((value) => !occupied.has(value))!;
        occupied.add(slot);
        await tx.reviewMedia.create({
          data: { ...image, reviewId, sortOrder: slot },
        });
      }
      return tx.reviewMedia.findMany({
        where: { reviewId },
        orderBy: reviewMediaOrder,
        select: { id: true, url: true, sortOrder: true },
      });
    });
  }

  remove(userId: string, reviewId: string, mediaId: string) {
    return this.locked(userId, reviewId, async (tx) => {
      const media = await tx.reviewMedia.findFirst({
        where: { id: mediaId, reviewId },
      });
      if (!media) this.notFound();
      await tx.reviewMedia.delete({ where: { id: media.id } });
      // Compact slots so newly appended images always appear after retained images.
      const remaining = await tx.reviewMedia.findMany({
        where: { reviewId },
        orderBy: reviewMediaOrder,
      });
      for (const [sortOrder, image] of remaining.entries()) {
        if (sortOrder !== image.sortOrder)
          await tx.reviewMedia.update({
            where: { id: image.id },
            data: { sortOrder },
          });
      }
      return media.objectKey;
    });
  }

  deleteReview(userId: string, reviewId: string) {
    return this.locked(userId, reviewId, async (tx) => {
      const media = await tx.reviewMedia.findMany({
        where: { reviewId },
        select: { objectKey: true },
      });
      await tx.review.delete({ where: { id: reviewId } });
      return media.map((image) => image.objectKey);
    });
  }

  private notFound(): never {
    throw new NotFoundException({
      code: 'REVIEW_NOT_FOUND',
      message: 'Không tìm thấy đánh giá hoặc ảnh đã chọn.',
    });
  }
}
