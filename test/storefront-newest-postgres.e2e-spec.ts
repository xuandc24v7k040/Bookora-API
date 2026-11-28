import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/database/prisma.service';
import { StorefrontCatalogRepository } from '@/modules/storefront-catalog/storefront-catalog.repository';
import { StorefrontProductSort } from '@/modules/storefront-catalog/dto';
import {
  createDisposablePostgresDatabase,
  readMigrationSql,
  runMigrations,
  type DisposablePostgresDatabase,
} from './helpers/postgres-test-database';

describe('newest catalog ordering across pages (PostgreSQL)', () => {
  let database: DisposablePostgresDatabase;
  let prisma: PrismaService;

  beforeAll(async () => {
    database = await createDisposablePostgresDatabase('newest_catalog');
    await runMigrations(database);
    await database.runSql(
      readMigrationSql('20260804143000_require_product_variant_weight'),
    );
    await database.runSql(
      readMigrationSql('20260807103000_storefront_search_extensions'),
    );
    await database.runSql(`
      INSERT INTO categories(id,name,slug,type,created_at,updated_at) VALUES ('newest-category','Newest','newest','NORMAL',now(),now());
      INSERT INTO products(id,name,slug,status,created_at,updated_at,release_date)
      SELECT 'newest-'||lpad(i::text,2,'0'),'Book '||lpad(i::text,2,'0'),'newest-'||i,'ACTIVE',
        TIMESTAMP '2026-11-01' + ((i-1)/3)*INTERVAL '1 day',
        TIMESTAMP '2030-01-01' - i*INTERVAL '1 day',
        TIMESTAMP '2030-01-01' - i*INTERVAL '1 day'
      FROM generate_series(1,36) i;
      INSERT INTO product_categories(id,product_id,category_id,is_primary)
      SELECT 'newest-link-'||i,'newest-'||lpad(i::text,2,'0'),'newest-category',true FROM generate_series(1,36) i;
      INSERT INTO product_variants(id,product_id,name,sku,combination_key,weight_gram,original_price,is_default,is_active,created_at,updated_at)
      SELECT 'newest-variant-'||i,'newest-'||lpad(i::text,2,'0'),'Default','NEWEST-'||i,'DEFAULT',300,100000,true,true,now(),now() FROM generate_series(1,36) i;
      INSERT INTO product_media(id,product_id,type,url,is_primary,created_at,updated_at)
      SELECT 'newest-image-'||i,'newest-'||lpad(i::text,2,'0'),'IMAGE','https://example.test/book.webp',true,now(),now() FROM generate_series(1,36) i;
    `);
    prisma = new PrismaService({
      getOrThrow: () => database.databaseUrl,
      get: () => 'test',
    } as unknown as ConfigService);
    await prisma.$connect();
  }, 60000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await database?.close();
  });

  it('orders the full visible filtered set by createdAt DESC/id DESC before LIMIT/OFFSET', async () => {
    const repository = new StorefrontCatalogRepository(prisma);
    const ids: string[] = [];
    for (const page of [1, 2, 3]) {
      const result = await repository.listProductPage(
        {
          sort: StorefrontProductSort.NEWEST,
          categorySlug: 'newest',
          page,
          pageSize: 12,
        },
        new Date('2026-11-28T00:00:00Z'),
      );
      expect(result.totalItems).toBe(36);
      ids.push(...result.records.map(({ id }) => id));
    }
    expect(ids).toEqual(
      Array.from(
        { length: 36 },
        (_, i) => `newest-${String(36 - i).padStart(2, '0')}`,
      ),
    );
    expect(new Set(ids).size).toBe(36);
  });
});
