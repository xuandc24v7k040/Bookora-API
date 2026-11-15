import { readFileSync } from 'fs';
import { join } from 'path';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/database/prisma.service';
import type { PublicSearchMatch } from '@/modules/storefront-catalog/storefront-catalog.repository';
import { StorefrontCatalogRepository } from '@/modules/storefront-catalog/storefront-catalog.repository';
import {
  createDisposablePostgresDatabase,
  runMigrations,
  type DisposablePostgresDatabase,
} from './helpers/postgres-test-database';

describe('storefront search ranking PostgreSQL behavior (e2e)', () => {
  let database: DisposablePostgresDatabase;
  let prisma: PrismaService;
  let searchProductMatches: (search: string) => Promise<PublicSearchMatch[]>;

  beforeAll(async () => {
    database = await createDisposablePostgresDatabase('search_ranking');
    await runMigrations(database);
    await database.runSql(
      readFileSync(
        join(
          process.cwd(),
          'prisma',
          'migrations',
          '20260807103000_storefront_search_extensions',
          'migration.sql',
        ),
        'utf8',
      ),
    );
    await seedSearchProducts(database);
    prisma = new PrismaService({
      getOrThrow: () => database.databaseUrl,
      get: () => 'test',
    } as unknown as ConfigService);
    await prisma.$connect();
    const repository = new StorefrontCatalogRepository(prisma);
    searchProductMatches = repository['searchProductMatches'].bind(repository);
  }, 60_000);

  afterAll(async () => {
    await prisma.$disconnect();
    await database.close();
  });

  it.each([
    ['your name', true],
    ['your', true],
    ['name', true],
    ['our', false],
    ['ame', false],
  ])('classifies "%s" against Your Name', async (query, isBestMatch) => {
    await expectMatch(query, 'product-your-name', isBestMatch);
  });

  it.each([
    ['siêu', true],
    ['sieu', true],
    ['kinh te', true],
    ['kinh te hoc', true],
    ['hai huoc', true],
    ['hài hước', true],
    ['huoc', true],
    ['hai huo', false],
    ['inh te', false],
    ['ai huo', false],
  ])(
    'classifies "%s" against the normalized Vietnamese title',
    async (query, isBestMatch) => {
      await expectMatch(query, 'product-economics', isBestMatch);
    },
  );

  it.each(['9786040000001', '8936000000001', 'YOUR-NAME-SKU'])(
    'keeps exact identifier %s as a best match',
    async (query) => {
      await expectMatch(query, 'product-your-name', true);
    },
  );

  it.each([
    ['Distinctive Writer', 'product-author'],
    ['Rare Press', 'product-publisher'],
    ['Your Nane', 'product-your-name'],
  ])(
    'returns %s matches without a best-match badge',
    async (query, productId) => {
      await expectMatch(query, productId, false);
    },
  );

  async function expectMatch(
    query: string,
    productId: string,
    isBestMatch: boolean,
  ): Promise<void> {
    const matches = await searchProductMatches(query);
    expect(matches.find((match) => match.id === productId)).toMatchObject({
      id: productId,
      isBestMatch,
    });
  }
});

async function seedSearchProducts(
  database: DisposablePostgresDatabase,
): Promise<void> {
  await database.runSql(`
    INSERT INTO publishers (id, name, slug, created_at, updated_at)
    VALUES ('publisher-rare', 'Rare Press', 'rare-press', NOW(), NOW());

    INSERT INTO authors (id, name, slug, created_at, updated_at)
    VALUES ('author-distinctive', 'Distinctive Writer', 'distinctive-writer', NOW(), NOW());

    INSERT INTO products (
      id, name, slug, publisher_id, status, created_at, updated_at
    ) VALUES
      ('product-your-name', 'Your Name', 'your-name', NULL, 'ACTIVE', NOW(), NOW()),
      ('product-economics', 'Siêu Kinh Tế Học Hài Hước', 'sieu-kinh-te-hoc-hai-huoc', NULL, 'ACTIVE', NOW(), NOW()),
      ('product-author', 'Authored Search Result', 'authored-search-result', NULL, 'ACTIVE', NOW(), NOW()),
      ('product-publisher', 'Published Search Result', 'published-search-result', 'publisher-rare', 'ACTIVE', NOW(), NOW());

    INSERT INTO product_authors (id, product_id, author_id)
    VALUES ('product-author-link', 'product-author', 'author-distinctive');

    INSERT INTO product_variants (
      id, product_id, name, sku, barcode, combination_key, isbn,
      weight_gram, original_price, is_default, is_active, created_at, updated_at
    ) VALUES
      ('variant-your-name', 'product-your-name', 'Default', 'YOUR-NAME-SKU', '8936000000001', 'DEFAULT', '9786040000001', 300, 100000, TRUE, TRUE, NOW(), NOW()),
      ('variant-economics', 'product-economics', 'Default', 'ECONOMICS-SKU', NULL, 'DEFAULT', NULL, 300, 100000, TRUE, TRUE, NOW(), NOW()),
      ('variant-author', 'product-author', 'Default', 'AUTHOR-SKU', NULL, 'DEFAULT', NULL, 300, 100000, TRUE, TRUE, NOW(), NOW()),
      ('variant-publisher', 'product-publisher', 'Default', 'PUBLISHER-SKU', NULL, 'DEFAULT', NULL, 300, 100000, TRUE, TRUE, NOW(), NOW());
  `);
}
