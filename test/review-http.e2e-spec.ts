import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import sharp from 'sharp';
import { ulid } from 'ulid';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/database/prisma.service';
import { setupApplication } from '@/core/app.setup';
import { R2ObjectStorageService } from '@/shared/storage/r2-object-storage.service';
import type { CustomerReviewDto, ReviewMediaDto } from '@/modules/reviews/dto';
import {
  createDisposablePostgresDatabase,
  readMigrationSql,
  runMigrations,
  type DisposablePostgresDatabase,
} from './helpers/postgres-test-database';

describe('Reviews HTTP / auth / CSRF / image lifecycle', () => {
  jest.setTimeout(120_000);
  let database: DisposablePostgresDatabase;
  let prisma: PrismaService;
  let app: INestApplication<App>;
  let ownerCookie: string[];
  let otherCookie: string[];
  const csrf = 'review-csrf-fixture-0123456789abcdef';
  const productId = ulid();
  const orderId = ulid();
  const firstItem = ulid();
  const secondItem = ulid();
  let review: CustomerReviewDto;
  const uploadedUrls: string[] = [];
  const realStorage = process.env.RUN_REVIEW_R2_SMOKE === '1';

  beforeAll(async () => {
    database = await createDisposablePostgresDatabase('review_http');
    await runMigrations(database);
    for (const migration of [
      '20260804143000_require_product_variant_weight',
      '20260807103000_storefront_search_extensions',
      '20261115140000_review_order_item_media',
    ])
      await database.runSql(readMigrationSql(migration));
    prisma = new PrismaService({
      getOrThrow: () => database.databaseUrl,
      get: () => 'test',
    } as unknown as ConfigService);
    const builder = Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma);
    if (!realStorage) {
      builder.overrideProvider(R2ObjectStorageService).useValue({
        upload: jest.fn((input: { key: string }) =>
          Promise.resolve({
            key: input.key,
            url: `https://example.test/${input.key}`,
          }),
        ),
        cleanupKeys: jest.fn().mockResolvedValue(undefined),
      });
    }
    const module = await builder.compile();
    app = module.createNestApplication({ logger: false });
    setupApplication(app);
    await app.init();
    const owner = await prisma.user.create({
      data: { email: `${ulid()}@review.test`, type: 'CUSTOMER' },
    });
    const other = await prisma.user.create({
      data: { email: `${ulid()}@review.test`, type: 'CUSTOMER' },
    });
    const branch = await prisma.branch.create({
      data: { name: 'Review test', code: ulid(), address: 'Fixture' },
    });
    await prisma.product.create({
      data: {
        id: productId,
        name: 'Review fixture',
        slug: ulid().toLowerCase(),
        status: 'ACTIVE',
      },
    });
    await prisma.order.create({
      data: {
        id: orderId,
        orderCode: ulid(),
        userId: owner.id,
        branchId: branch.id,
        idempotencyKey: ulid(),
        status: 'COMPLETED',
        subtotalAmount: 100,
        totalAmount: 100,
        shippingFee: 0,
        receiverName: 'Fixture',
        receiverPhone: '0900000000',
        shippingAddress: 'Fixture',
        deliveryAddressSource: 'CURRENT_LOCATION',
        shippingAddressLine: 'Fixture',
        shippingProvinceName: 'Province',
        shippingWardName: 'Ward',
        branchNameSnapshot: 'Review test',
        branchAddressSnapshot: 'Fixture',
        shippingFeeBreakdownSnapshot: {},
        shippingQuoteReference: ulid(),
        items: {
          create: [firstItem, secondItem].map((id, index) => ({
            id,
            productId,
            productName: 'Review fixture',
            productSlug: 'review-fixture',
            variantLabel: 'Historical',
            variantOptions: index
              ? []
              : [
                  { name: 'Màu mực', value: 'Xanh' },
                  { name: 'Quy cách', value: 'Hộp 10' },
                ],
            quantity: 2,
            unitPrice: 50,
            originalPrice: 50,
            lineTotal: 100,
          })),
        },
      },
    });
    const jwt = new JwtService();
    const secret = app
      .get(ConfigService)
      .getOrThrow<string>('auth.jwt.accessSecret');
    const cookies = async (userId: string) => {
      const session = await prisma.authSession.create({
        data: {
          userId,
          refreshTokenHash: ulid(),
          expiresAt: new Date(Date.now() + 600000),
        },
      });
      const token = jwt.sign(
        { sub: userId, sid: session.id },
        { secret, expiresIn: '10m' },
      );
      return [`accessToken=${token}`, `csrfToken=${csrf}`];
    };
    ownerCookie = await cookies(owner.id);
    otherCookie = await cookies(other.id);
  });

  afterAll(async () => {
    // Only disposable fixtures are removed; no application database records are touched.
    if (realStorage && app && prisma) {
      const remaining = await prisma.reviewMedia.findMany({
        select: { objectKey: true, reviewId: true },
      });
      const storage = app.get(R2ObjectStorageService);
      for (const image of remaining)
        await storage.cleanupKeys(
          [image.objectKey],
          `reviews/${image.reviewId}/`,
          'e2e-finally',
        );
    }
    await app?.close();
    await prisma?.$disconnect();
    await database?.close();
  });

  it('requires authentication and CSRF, creates by purchased line, and rejects foreign/immutable IDs', async () => {
    const body = { orderId, orderItemId: firstItem, productId, rating: 5 };
    await request(app.getHttpServer())
      .post('/api/v1/account/reviews')
      .send(body)
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/account/reviews')
      .set('Cookie', ownerCookie)
      .send(body)
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/account/reviews')
      .set('Cookie', otherCookie)
      .set('X-CSRF-Token', csrf)
      .send(body)
      .expect(403);
    const response = await request(app.getHttpServer())
      .post('/api/v1/account/reviews')
      .set('Cookie', ownerCookie)
      .set('X-CSRF-Token', csrf)
      .send(body)
      .expect(201);
    review = (response.body as { data: CustomerReviewDto }).data;
    expect(review.variantLabel).toBe('Màu mực: Xanh · Quy cách: Hộp 10');
    expect(review.media).toEqual([]);
    const withoutImages = await request(app.getHttpServer())
      .get(`/api/v1/storefront/products/${productId}/reviews?hasImages=true`)
      .expect(200);
    expect(
      (withoutImages.body as { data: { totalItems: number } }).data.totalItems,
    ).toBe(0);
    await request(app.getHttpServer())
      .post('/api/v1/account/reviews')
      .set('Cookie', ownerCookie)
      .set('X-CSRF-Token', csrf)
      .send(body)
      .expect(409);
    await request(app.getHttpServer())
      .patch(`/api/v1/account/reviews/${review.id}`)
      .set('Cookie', ownerCookie)
      .set('X-CSRF-Token', csrf)
      .send({ rating: 4, orderItemId: secondItem })
      .expect(400);
  });

  it('validates multipart bytes, ownership, CSRF and four-photo quota', async () => {
    const server = app.getHttpServer();
    const url = `/api/v1/account/reviews/${review.id}/images`;
    const png = await sharp({
      create: { width: 64, height: 64, channels: 3, background: '#16803d' },
    })
      .png()
      .toBuffer();
    await request(server)
      .post(url)
      .set('Cookie', ownerCookie)
      .attach('files', png, 'image.png')
      .expect(403);
    await request(server)
      .post(url)
      .set('Cookie', otherCookie)
      .set('X-CSRF-Token', csrf)
      .attach('files', png, 'image.png')
      .expect(404);
    await request(server)
      .post(url)
      .set('Cookie', ownerCookie)
      .set('X-CSRF-Token', csrf)
      .attach('files', Buffer.from('not-image'), 'fake.png')
      .expect(400);
    await request(server)
      .post(url)
      .set('Cookie', ownerCookie)
      .set('X-CSRF-Token', csrf)
      .attach('files', Buffer.alloc(5 * 1024 * 1024 + 1), 'large.png')
      .expect(413);
    let images: ReviewMediaDto[] = [];
    for (const [index, format] of (
      ['jpeg', 'png', 'webp', 'png'] as const
    ).entries()) {
      const bytes = await sharp(png).toFormat(format).toBuffer();
      const response = await request(server)
        .post(url)
        .set('Cookie', ownerCookie)
        .set('X-CSRF-Token', csrf)
        .attach('files', bytes, `review.${format}`)
        .expect(201);
      images = (response.body as { data: ReviewMediaDto[] }).data;
      expect(images).toHaveLength(index + 1);
      if (realStorage) {
        const imageUrl = images.at(-1)!.url;
        uploadedUrls.push(imageUrl);
        const read = await fetch(imageUrl);
        expect(read.status).toBe(200);
        expect(read.headers.get('content-type')).toContain('image/webp');
      }
    }
    await request(server)
      .post(url)
      .set('Cookie', ownerCookie)
      .set('X-CSRF-Token', csrf)
      .attach('files', png, 'fifth.png')
      .expect(409);
    expect(
      await prisma.reviewMedia.count({ where: { reviewId: review.id } }),
    ).toBe(4);
    const read = await request(server)
      .get(`/api/v1/storefront/products/${productId}/reviews?hasImages=true`)
      .expect(200);
    const publicReview = (read.body as { data: { items: CustomerReviewDto[] } })
      .data.items[0];
    expect(publicReview.media).toHaveLength(4);
    expect(publicReview).not.toHaveProperty('orderId');
    expect(publicReview.media[0]).not.toHaveProperty('objectKey');
    expect(
      (read.body as { data: { totalItems: number } }).data.totalItems,
    ).toBe(1);
    const textOnly = await request(server)
      .get(`/api/v1/storefront/products/${productId}/reviews?hasImages=false`)
      .expect(200);
    expect(
      (textOnly.body as { data: { totalItems: number } }).data.totalItems,
    ).toBe(0);
    await request(server)
      .delete(`${url}/${images[0].id}`)
      .set('Cookie', otherCookie)
      .set('X-CSRF-Token', csrf)
      .expect(404);
    await request(server)
      .delete(`${url}/${images[0].id}`)
      .set('Cookie', ownerCookie)
      .set('X-CSRF-Token', csrf)
      .expect(200);
    expect(
      await prisma.reviewMedia.count({ where: { reviewId: review.id } }),
    ).toBe(3);
    await request(server)
      .delete(`/api/v1/account/reviews/${review.id}`)
      .set('Cookie', ownerCookie)
      .set('X-CSRF-Token', csrf)
      .expect(200);
    expect(
      await prisma.reviewMedia.count({ where: { reviewId: review.id } }),
    ).toBe(0);
    if (realStorage) {
      for (const imageUrl of uploadedUrls) {
        const deleted = await fetch(`${imageUrl}?reviewCleanupCheck=${ulid()}`);
        expect(deleted.status).toBe(404);
      }
    }
  });
});
