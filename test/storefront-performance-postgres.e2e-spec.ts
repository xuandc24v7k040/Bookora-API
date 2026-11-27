import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/database/prisma.service';
import { StorefrontCatalogRepository } from '@/modules/storefront-catalog/storefront-catalog.repository';
import {
  createDisposablePostgresDatabase,
  readMigrationSql,
  runMigrations,
  type DisposablePostgresDatabase,
} from './helpers/postgres-test-database';

describe('Storefront performance query semantics (PostgreSQL)', () => {
  let database: DisposablePostgresDatabase;
  let prisma: PrismaService;
  let repository: StorefrontCatalogRepository;

  beforeAll(async () => {
    database = await createDisposablePostgresDatabase('catalog_performance');
    await runMigrations(database);
    await database.runSql(
      readMigrationSql('20260804143000_require_product_variant_weight'),
    );
    await database.runSql(
      readMigrationSql('20260807103000_storefront_search_extensions'),
    );
    await database.runSql(`
      INSERT INTO users(id,email,created_at,updated_at)
      VALUES ('perf-user','perf@example.test',now(),now());
      INSERT INTO branches(id,name,code,address,created_at,updated_at)
      VALUES ('perf-branch','Performance','PERFORMANCE','QA',now(),now());
      INSERT INTO categories(id,name,slug,type,created_at,updated_at)
      VALUES ('perf-category','Performance','performance','NORMAL',now(),now());
      INSERT INTO products(id,name,slug,status,created_at,updated_at)
      SELECT 'perf-product-'||i,'Performance Book '||i,'performance-book-'||i,
        CASE WHEN i=1 THEN 'DRAFT'::"ProductStatus" ELSE 'ACTIVE'::"ProductStatus" END,now(),now()
      FROM generate_series(1,8) i;
      INSERT INTO product_categories(id,product_id,category_id,is_primary)
      SELECT 'perf-category-link-'||i,'perf-product-'||i,'perf-category',true FROM generate_series(1,8) i;
      INSERT INTO product_variants(id,product_id,name,sku,combination_key,weight_gram,original_price,is_default,is_active,created_at,updated_at)
      SELECT 'perf-variant-'||i,'perf-product-'||i,'Default','PERF-'||i,'DEFAULT',300,100000,true,true,now(),now()
      FROM generate_series(1,8) i;
      INSERT INTO product_media(id,product_id,type,url,is_primary,created_at,updated_at)
      SELECT 'perf-media-'||i,'perf-product-'||i,'IMAGE','https://example.test/public.webp',true,now(),now()
      FROM generate_series(1,8) i WHERE i<>2;
      INSERT INTO orders(id,order_code,user_id,branch_id,status,subtotal_amount,total_amount,shipping_fee,
        receiver_name,receiver_phone,shipping_address,idempotency_key,delivery_address_source,
        shipping_address_line,shipping_province_name,shipping_ward_name,branch_name_snapshot,branch_address_snapshot,
        shipping_fee_breakdown_snapshot,shipping_quote_reference,created_at,updated_at)
      SELECT id,id,'perf-user','perf-branch',status::"OrderStatus",100,100,0,'QA','0900000000','QA',id,'CURRENT_LOCATION',
        'QA','Province','Ward','Branch','QA','{}',id,now(),now()
      FROM (VALUES ('perf-completed','COMPLETED'),('perf-pending','PENDING')) fixture(id,status);
      INSERT INTO order_items(id,order_id,product_id,variant_id,product_name,product_slug,variant_label,variant_options,quantity,unit_price,original_price,line_total)
      VALUES ('perf-line-a','perf-completed','historical-product-id','perf-variant-3','Historical','historical','Default','[]',2,100,100,200),
        ('perf-line-b','perf-completed',NULL,'perf-variant-3','Historical','historical','Default','[]',5,100,100,500),
        ('perf-line-null','perf-completed','perf-product-4',NULL,'Deleted variant','deleted','Default','[]',100,100,100,10000),
        ('perf-line-pending','perf-pending','perf-product-4','perf-variant-4','Pending','pending','Default','[]',50,100,100,5000);
    `);
    prisma = new PrismaService({
      getOrThrow: () => database.databaseUrl,
      get: () => 'test',
    } as unknown as ConfigService);
    await prisma.$connect();
    repository = new StorefrontCatalogRepository(prisma);
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await database?.close();
  });

  it('aggregates COMPLETED quantities by the live variant product, ignoring deleted variants and other statuses', async () => {
    expect(await repository.completedSalesByProduct()).toEqual(
      new Map([['perf-product-3', 7]]),
    );
  });

  it('filters visibility before limiting suggestions and keeps full total, rank and badge semantics', async () => {
    const result = await repository.listSearchSuggestions('Performance', 2);
    expect(result.totalItems).toBe(6);
    expect(result.records.map(({ product }) => product.id)).toEqual([
      'perf-product-3',
      'perf-product-4',
    ]);
    expect(result.records[0]).toMatchObject({
      isBestMatch: true,
      isBestSeller: true,
    });
    expect(result.records[1]).toMatchObject({
      isBestMatch: true,
      isBestSeller: false,
    });
  });

  it('keeps Home visibility and observes a committed hide immediately', async () => {
    expect(
      (await repository.listHomeCandidates()).map(({ id }) => id).sort(),
    ).toEqual([3, 4, 5, 6, 7, 8].map((i) => `perf-product-${i}`));
    await database.runSql(
      "UPDATE products SET status='DRAFT' WHERE id='perf-product-8'",
    );
    expect(
      (await repository.listHomeCandidates()).map(({ id }) => id),
    ).not.toContain('perf-product-8');
  });
});
