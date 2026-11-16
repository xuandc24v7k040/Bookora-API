import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/database/prisma.service';
import { ReviewsRepository } from '@/modules/reviews/reviews.repository';
import { ReviewMediaRepository } from '@/modules/reviews/review-media.repository';
import { ReviewsService } from '@/modules/reviews/reviews.service';
import type { ReviewMediaService } from '@/modules/reviews/review-media.service';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';
import {
  createDisposablePostgresDatabase,
  readMigrationSql,
  runMigrations,
  type DisposablePostgresDatabase,
} from './helpers/postgres-test-database';

describe('Review OrderItem migration and concurrency (PostgreSQL)', () => {
  let database: DisposablePostgresDatabase;
  let prisma: PrismaService;
  let repository: ReviewsRepository;
  let service: ReviewsService;
  let media: ReviewMediaRepository;
  const actor = { id: 'review-user', type: 'CUSTOMER' } as AuthenticatedUser;
  let before: unknown[];

  beforeAll(async () => {
    database = await createDisposablePostgresDatabase('review_upgrade');
    await runMigrations(database);
    await database.runSql(
      readMigrationSql('20260804143000_require_product_variant_weight'),
    );
    await database.runSql(
      readMigrationSql('20260807103000_storefront_search_extensions'),
    );
    await database.runSql(`
      INSERT INTO users(id,email,created_at,updated_at) VALUES ('review-user','review@example.test',now(),now()),('other-user','other@example.test',now(),now());
      INSERT INTO branches(id,name,code,address,created_at,updated_at) VALUES ('review-branch','Review','REVIEW','Address',now(),now());
      INSERT INTO products(id,name,slug,status,created_at,updated_at) VALUES ('review-product','Review','review-product','ACTIVE',now(),now());
      INSERT INTO orders(id,order_code,user_id,branch_id,status,subtotal_amount,total_amount,shipping_fee,
        receiver_name,receiver_phone,shipping_address,idempotency_key,delivery_address_source,
        shipping_address_line,shipping_province_name,shipping_ward_name,branch_name_snapshot,branch_address_snapshot,
        shipping_fee_breakdown_snapshot,shipping_quote_reference,created_at,updated_at)
      SELECT id,id,'review-user','review-branch','COMPLETED',100,100,0,'Customer','0900000000','Address',id,'CURRENT_LOCATION',
        'Address','Province','Ward','Branch','Address','{}',id,now(),now()
      FROM unnest(ARRAY['review-exact','review-ambiguous','review-new']) id;
      INSERT INTO order_items(id,order_id,product_id,product_name,product_slug,variant_label,variant_options,quantity,unit_price,original_price,line_total)
      VALUES ('exact-item','review-exact','review-product','Review','review-product','Historical','[{"name":"Bìa","value":"Cứng"}]',1,100,100,100),
        ('ambiguous-a','review-ambiguous','review-product','Review','review-product','A','[]',1,100,100,100),
        ('ambiguous-b','review-ambiguous','review-product','Review','review-product','B','[]',1,100,100,100),
        ('new-a','review-new','review-product','Review','review-product','A','[{"name":"Màu mực","value":"Xanh"},{"name":"Quy cách","value":"Hộp 10"}]',3,100,100,300),
        ('new-b','review-new','review-product','Review','review-product','B','[]',1,100,100,100);
      INSERT INTO reviews(id,user_id,order_id,product_id,rating,content,created_at,updated_at)
      VALUES ('legacy-exact','review-user','review-exact','review-product',4,'Lịch sử',now(),now()),
        ('legacy-ambiguous','review-user','review-ambiguous','review-product',5,null,now(),now());
    `);
    before = await database.query(
      'SELECT id,rating,content,is_visible,created_at,updated_at FROM reviews ORDER BY id',
    );
    await database.runSql(
      readMigrationSql('20261115140000_review_order_item_media'),
    );
    prisma = new PrismaService({
      getOrThrow: () => database.databaseUrl,
      get: () => 'test',
    } as unknown as ConfigService);
    await prisma.$connect();
    repository = new ReviewsRepository(prisma);
    media = new ReviewMediaRepository(prisma);
    service = new ReviewsService(repository, {} as ReviewMediaService);
  }, 60000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await database?.close();
  });

  it('preserves every legacy field and only backfills uniquely matched lines', async () => {
    expect(
      await database.query(
        'SELECT id,rating,content,is_visible,created_at,updated_at FROM reviews ORDER BY id',
      ),
    ).toEqual(before);
    expect(
      await database.query('SELECT id,order_item_id FROM reviews ORDER BY id'),
    ).toEqual([
      { id: 'legacy-ambiguous', order_item_id: null },
      { id: 'legacy-exact', order_item_id: 'exact-item' },
    ]);
  });

  it('returns two independent pending lines and excludes all ambiguous legacy lines', async () => {
    const result = await repository.listPending(actor.id, {});
    expect(result.items.map((item) => item.orderItemId).sort()).toEqual([
      'new-a',
      'new-b',
    ]);
    expect(result.totalItems).toBe(2);
    await expect(
      service.create(actor, {
        orderId: 'review-ambiguous',
        productId: 'review-product',
        orderItemId: 'ambiguous-a',
        rating: 5,
      }),
    ).rejects.toMatchObject({
      response: { code: 'REVIEW_LEGACY_ALREADY_EXISTS' },
    });
  });

  it('persists exactly one concurrent review per line, including quantity greater than one', async () => {
    const payload = {
      orderId: 'review-new',
      productId: 'review-product',
      orderItemId: 'new-a',
      rating: 5,
    };
    const results = await Promise.allSettled([
      service.create(actor, payload),
      service.create(actor, payload),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({ reason: { status: 409 } });
    const second = await service.create(actor, {
      ...payload,
      orderItemId: 'new-b',
      rating: 4,
    });
    expect(second.orderItemId).toBe('new-b');
    expect(
      await prisma.review.count({ where: { orderId: payload.orderId } }),
    ).toBe(2);
    const publicReviews = await service.publicList('review-product', {});
    expect(publicReviews.reviewCount).toBe(4);
    expect(
      publicReviews.items.find((item) => item.variantLabel?.includes('Màu mực'))
        ?.variantLabel,
    ).toBe('Màu mực: Xanh · Quy cách: Hộp 10');
  });

  it('serializes media quota, enforces DB slots, and scopes remove to owner/review', async () => {
    const review = await prisma.review.findUniqueOrThrow({
      where: { orderItemId: 'new-a' },
    });
    const batch = (prefix: string) =>
      Array.from({ length: 3 }, (_, i) => ({
        objectKey: `reviews/${review.id}/${prefix}${i}.webp`,
        url: `https://example.test/${prefix}${i}`,
      }));
    const results = await Promise.allSettled([
      media.add(actor.id, review.id, batch('a')),
      media.add(actor.id, review.id, batch('b')),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      await prisma.reviewMedia.count({ where: { reviewId: review.id } }),
    ).toBe(3);
    await media.add(actor.id, review.id, [batch('c')[0]]);
    await expect(
      media.add(actor.id, review.id, [batch('d')[0]]),
    ).rejects.toMatchObject({ status: 409 });
    const images = await prisma.reviewMedia.findMany({
      where: { reviewId: review.id },
      orderBy: { sortOrder: 'asc' },
    });
    await expect(
      media.remove('other-user', review.id, images[0].id),
    ).rejects.toMatchObject({ status: 404 });
    await media.remove(actor.id, review.id, images[1].id);
    const after = await media.add(actor.id, review.id, [batch('e')[0]]);
    expect(after.map((image) => image.id).slice(0, 3)).toEqual([
      images[0].id,
      images[2].id,
      images[3].id,
    ]);
    await prisma.review.update({
      where: { id: review.id },
      data: { isVisible: false },
    });
    expect(
      (await service.publicList('review-product', {})).items.some(
        (item) => item.id === review.id,
      ),
    ).toBe(false);
    const keys = await media.deleteReview(actor.id, review.id);
    expect(keys).toHaveLength(4);
    expect(
      await prisma.reviewMedia.count({ where: { reviewId: review.id } }),
    ).toBe(0);
  });
});
