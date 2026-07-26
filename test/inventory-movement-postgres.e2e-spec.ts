import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaService } from '@/database/prisma.service';
import { PrismaClient } from '@/generated/prisma/client';
import {
  InventoryAdjustmentDirection,
  GroupedStockSortField,
} from '@/modules/inventory/dto';
import {
  InventoryDomainError,
  InventoryRepository,
} from '@/modules/inventory/inventory.repository';
import {
  createDisposablePostgresDatabase,
  runMigrations,
  type DisposablePostgresDatabase,
} from './helpers/postgres-test-database';

describe('inventory movement PostgreSQL invariants (e2e)', () => {
  let database: DisposablePostgresDatabase;
  let prisma: PrismaService;
  let repository: InventoryRepository;

  beforeAll(async () => {
    database = await createDisposablePostgresDatabase('inventory_movement');
    await runMigrations(database);
    await seedInventory(database);
    prisma = new PrismaService({
      getOrThrow: () => database.databaseUrl,
      get: () => 'test',
    } as unknown as ConfigService);
    await prisma.$connect();
    repository = new InventoryRepository(prisma);
  }, 60_000);

  afterAll(async () => {
    await prisma.$disconnect();
    await database.close();
  });

  it.each([
    ['zero delta', `0, 10, 10`],
    ['negative before', `1, -1, 0`],
    ['negative after', `-1, 0, -1`],
    ['invalid equation', `2, 10, 11`],
  ])('rejects %s through database constraints', async (_label, quantities) => {
    await expect(
      database.runSql(movementInsert(`constraint-${_label}`, quantities)),
    ).rejects.toThrow();
  });

  it('enforces FK, unique source identity, and actor ON DELETE SET NULL', async () => {
    await expect(
      database.runSql(
        movementInsert('invalid-fk', '1, 0, 1').replace(
          `'variant-main'`,
          `'missing-variant'`,
        ),
      ),
    ).rejects.toThrow();

    await database.runSql(movementInsert('unique-source', '1, 40, 41'));
    await expect(
      database.runSql(
        movementInsert('unique-source-copy', '1, 41, 42').replace(
          `'unique-source-copy'`,
          `'unique-source'`,
        ),
      ),
    ).rejects.toThrow();

    await database.runSql(`
      INSERT INTO users (id, email, created_at, updated_at)
      VALUES ('actor-set-null', 'actor-set-null@bookora.local', NOW(), NOW());
    `);
    await database.runSql(
      movementInsert('actor-source', '1, 41, 42').replace(
        `NULL, NOW()`,
        `'actor-set-null', NOW()`,
      ),
    );
    await database.runSql(`DELETE FROM users WHERE id = 'actor-set-null'`);
    const actors = await database.query<{ actor_id: string | null }>(`
      SELECT actor_id FROM inventory_movements WHERE id = 'actor-source'
    `);
    expect(actors).toEqual([{ actor_id: null }]);
  });

  it('allows exactly one concurrent adjustment with the same expected quantity', async () => {
    const requests = await Promise.allSettled([
      repository.adjustQuantity(
        'branch-main',
        'variant-concurrent',
        'user-main',
        {
          expectedCurrentQuantity: 40,
          direction: InventoryAdjustmentDirection.INCREASE,
          quantity: 5,
          note: 'Concurrent increase',
        },
      ),
      repository.adjustQuantity(
        'branch-main',
        'variant-concurrent',
        'user-main',
        {
          expectedCurrentQuantity: 40,
          direction: InventoryAdjustmentDirection.DECREASE,
          quantity: 3,
          note: 'Concurrent decrease',
        },
      ),
    ]);
    const fulfilled = requests.filter(
      (result) => result.status === 'fulfilled',
    );
    const rejected = requests.filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(InventoryDomainError);
    expect(rejected[0].reason).toMatchObject({
      code: 'INVENTORY_QUANTITY_CHANGED',
    });

    const rows = await database.query<{
      quantity: number;
      receipts: number;
      items: number;
      movements: number;
    }>(`
      SELECT s.quantity,
        (SELECT COUNT(*)::int FROM stock_receipts r
         JOIN stock_receipt_items i ON i.receipt_id = r.id
         WHERE r.type = 'ADJUSTMENT' AND i.variant_id = 'variant-concurrent') receipts,
        (SELECT COUNT(*)::int FROM stock_receipt_items i
         JOIN stock_receipts r ON r.id = i.receipt_id
         WHERE r.type = 'ADJUSTMENT' AND i.variant_id = 'variant-concurrent') items,
        (SELECT COUNT(*)::int FROM inventory_movements
         WHERE variant_id = 'variant-concurrent' AND type = 'MANUAL_ADJUSTMENT') movements
      FROM branch_product_stocks s
      WHERE s.branch_id = 'branch-main' AND s.variant_id = 'variant-concurrent'
    `);
    expect([37, 45]).toContain(rows[0].quantity);
    expect(rows[0]).toMatchObject({ receipts: 1, items: 1, movements: 1 });
  });

  it('rolls back receipt, item, stock, and movement when movement insertion fails', async () => {
    await database.runSql(`
      CREATE FUNCTION reject_rollback_variant_movement() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.variant_id = 'variant-rollback' THEN
          RAISE EXCEPTION 'intentional inventory rollback';
        END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER reject_rollback_variant_movement
      BEFORE INSERT ON inventory_movements
      FOR EACH ROW EXECUTE FUNCTION reject_rollback_variant_movement();
    `);
    await expect(
      repository.adjustQuantity(
        'branch-main',
        'variant-rollback',
        'user-main',
        {
          expectedCurrentQuantity: 10,
          direction: InventoryAdjustmentDirection.INCREASE,
          quantity: 2,
          note: 'Force rollback',
        },
      ),
    ).rejects.toThrow('intentional inventory rollback');

    const rows = await database.query<{
      quantity: number;
      receipts: number;
      items: number;
      movements: number;
    }>(`
      SELECT s.quantity,
        (SELECT COUNT(*)::int FROM stock_receipts r
         JOIN stock_receipt_items i ON i.receipt_id = r.id
         WHERE r.type = 'ADJUSTMENT' AND i.variant_id = 'variant-rollback') receipts,
        (SELECT COUNT(*)::int FROM stock_receipt_items WHERE variant_id = 'variant-rollback') items,
        (SELECT COUNT(*)::int FROM inventory_movements WHERE variant_id = 'variant-rollback') movements
      FROM branch_product_stocks s
      WHERE s.branch_id = 'branch-main' AND s.variant_id = 'variant-rollback'
    `);
    expect(rows).toEqual([
      { quantity: 10, receipts: 0, items: 0, movements: 0 },
    ]);
  });

  it('uses a constant query count for grouped products and movement pages', async () => {
    const measuredPrisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: database.databaseUrl }),
      log: [{ emit: 'event', level: 'query' }],
    });
    await measuredPrisma.$connect();
    const measuredRepository = new InventoryRepository(
      measuredPrisma as unknown as PrismaService,
    );
    const queries: string[] = [];
    measuredPrisma.$on('query', (event) => {
      queries.push(event.query);
    });
    try {
      queries.length = 0;
      await measuredRepository.listGroupedStocks('branch-main', {
        page: 1,
        limit: 1,
        sortBy: GroupedStockSortField.PRODUCT_NAME,
      });
      const groupedOneProduct = queries.length;
      queries.length = 0;
      await measuredRepository.listGroupedStocks('branch-main', {
        page: 1,
        limit: 10,
        sortBy: GroupedStockSortField.PRODUCT_NAME,
      });
      const groupedTenProducts = queries.length;
      queries.length = 0;
      await measuredRepository.listMovements('branch-main', {
        page: 1,
        limit: 1,
      });
      const oneMovement = queries.length;
      queries.length = 0;
      await measuredRepository.listMovements('branch-main', {
        page: 1,
        limit: 20,
      });
      expect({
        groupedOneProduct,
        groupedTenProducts,
        oneMovement,
        twentyMovements: queries.length,
      }).toEqual({
        groupedOneProduct: 13,
        groupedTenProducts: 13,
        oneMovement: 10,
        twentyMovements: 10,
      });
    } finally {
      await measuredPrisma.$disconnect();
    }
  });
});

function movementInsert(id: string, quantities: string): string {
  return `
    INSERT INTO inventory_movements (
      id, branch_id, variant_id, type, quantity_change,
      before_quantity, after_quantity, reason, source_type,
      source_id, source_code, actor_id, created_at
    ) VALUES (
      '${id}', 'branch-main', 'variant-main', 'ORDER_STOCK_RESTORED',
      ${quantities}, 'Integration test', 'ORDER', '${id}', '${id}', NULL, NOW()
    )
  `;
}

async function seedInventory(
  database: DisposablePostgresDatabase,
): Promise<void> {
  await database.runSql(`
    INSERT INTO users (id, email, created_at, updated_at)
    VALUES ('user-main', 'inventory-integration@bookora.local', NOW(), NOW());
    INSERT INTO branches (id, name, code, address, is_active, created_at, updated_at)
    VALUES ('branch-main', 'Inventory Branch', 'INV', 'Test address', TRUE, NOW(), NOW());
    INSERT INTO products (id, name, slug, status, created_at, updated_at)
    VALUES
      ('product-main', 'Main product', 'main-product', 'ACTIVE', NOW(), NOW()),
      ('product-concurrent', 'Concurrent product', 'concurrent-product', 'ACTIVE', NOW(), NOW()),
      ('product-rollback', 'Rollback product', 'rollback-product', 'ACTIVE', NOW(), NOW());
    INSERT INTO product_variants (
      id, product_id, name, sku, combination_key, original_price,
      is_default, is_active, created_at, updated_at
    ) VALUES
      ('variant-main', 'product-main', 'Default', 'MAIN', 'DEFAULT', 100, TRUE, TRUE, NOW(), NOW()),
      ('variant-concurrent', 'product-concurrent', 'Default', 'CONCURRENT', 'DEFAULT', 100, TRUE, TRUE, NOW(), NOW()),
      ('variant-rollback', 'product-rollback', 'Default', 'ROLLBACK', 'DEFAULT', 100, TRUE, TRUE, NOW(), NOW());
    INSERT INTO branch_product_stocks (
      id, branch_id, variant_id, quantity, low_stock_threshold, created_at, updated_at
    ) VALUES
      ('stock-main', 'branch-main', 'variant-main', 40, 5, NOW(), NOW()),
      ('stock-concurrent', 'branch-main', 'variant-concurrent', 40, 5, NOW(), NOW()),
      ('stock-rollback', 'branch-main', 'variant-rollback', 10, 5, NOW(), NOW());

    INSERT INTO products (id, name, slug, status, created_at, updated_at)
    SELECT 'product-page-' || value, 'Paged product ' || value,
           'paged-product-' || value, 'ACTIVE', NOW(), NOW()
    FROM generate_series(1, 10) value;
    INSERT INTO product_variants (
      id, product_id, name, sku, combination_key, original_price,
      is_default, is_active, created_at, updated_at
    )
    SELECT 'variant-page-' || value, 'product-page-' || value, 'Default',
           'PAGE-' || value, 'DEFAULT', 100, TRUE, TRUE, NOW(), NOW()
    FROM generate_series(1, 10) value;
    INSERT INTO branch_product_stocks (
      id, branch_id, variant_id, quantity, low_stock_threshold, created_at, updated_at
    )
    SELECT 'stock-page-' || value, 'branch-main', 'variant-page-' || value,
           value, 5, NOW(), NOW()
    FROM generate_series(1, 10) value;
    INSERT INTO inventory_movements (
      id, branch_id, variant_id, type, quantity_change,
      before_quantity, after_quantity, reason, source_type,
      source_id, source_code, created_at
    )
    SELECT 'movement-page-' || value, 'branch-main', 'variant-main',
           'ORDER_STOCK_RESTORED', 1, 40, 41, 'Paged movement', 'ORDER',
           'order-page-' || value, 'ORDER-PAGE-' || value, NOW()
    FROM generate_series(1, 25) value;
  `);
}
