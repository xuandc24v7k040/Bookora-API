import { Client } from 'pg';
import {
  createDisposablePostgresDatabase,
  runMigrations,
  type DisposablePostgresDatabase,
} from './helpers/postgres-test-database';

describe('schema refactor target invariants (e2e)', () => {
  let database: DisposablePostgresDatabase;

  beforeAll(async () => {
    database = await createDisposablePostgresDatabase('schema_refactor');
    await runMigrations(database);
    await seedBaseData(database);
  }, 30_000);

  afterAll(async () => {
    await database.close();
  });

  it('supports simple, one-option, and two-option products and rejects duplicate combinations', async () => {
    await database.runSql(`
      INSERT INTO products (id, name, slug, status, created_at, updated_at)
      VALUES
        ('product-simple', 'Simple', 'simple', 'ACTIVE', NOW(), NOW()),
        ('product-cover', 'Cover', 'cover', 'ACTIVE', NOW(), NOW()),
        ('product-two-options', 'Two options', 'two-options', 'ACTIVE', NOW(), NOW());

      INSERT INTO product_variants (
        id, product_id, name, sku, combination_key, original_price,
        is_default, is_active, created_at, updated_at
      ) VALUES
        ('variant-simple', 'product-simple', 'Default', 'SIMPLE-DEFAULT', 'DEFAULT', 100, TRUE, TRUE, NOW(), NOW()),
        ('variant-cover', 'product-cover', 'Hardcover', 'COVER-HARD', 'COVER=HARD', 200, TRUE, TRUE, NOW(), NOW()),
        ('variant-two', 'product-two-options', 'Blue 20', 'BLUE-20', 'INK=BLUE|PACK=20', 300, TRUE, TRUE, NOW(), NOW());

      INSERT INTO product_options (id, product_id, name, code, sort_order, created_at, updated_at)
      VALUES
        ('option-cover', 'product-cover', 'Cover', 'COVER', 1, NOW(), NOW()),
        ('option-ink', 'product-two-options', 'Ink', 'INK', 1, NOW(), NOW()),
        ('option-pack', 'product-two-options', 'Pack', 'PACK', 2, NOW(), NOW());

      INSERT INTO product_option_values (id, option_id, label, value, sort_order)
      VALUES
        ('value-hard', 'option-cover', 'Hard', 'HARD', 1),
        ('value-blue', 'option-ink', 'Blue', 'BLUE', 1),
        ('value-red', 'option-ink', 'Red', 'RED', 2),
        ('value-pack-20', 'option-pack', '20', '20', 1);

      INSERT INTO product_variant_option_values (id, variant_id, option_id, option_value_id)
      VALUES
        ('link-cover', 'variant-cover', 'option-cover', 'value-hard'),
        ('link-blue', 'variant-two', 'option-ink', 'value-blue'),
        ('link-pack', 'variant-two', 'option-pack', 'value-pack-20');
    `);

    await expect(
      database.runSql(`
        INSERT INTO product_variants (
          id, product_id, name, sku, combination_key, original_price,
          is_default, is_active, created_at, updated_at
        ) VALUES (
          'variant-simple-duplicate', 'product-simple', 'Duplicate',
          'SIMPLE-DUPLICATE', 'DEFAULT', 100, FALSE, TRUE, NOW(), NOW()
        )
      `),
    ).rejects.toThrow();

    await expect(
      database.runSql(`
        INSERT INTO product_variant_option_values (id, variant_id, option_id, option_value_id)
        VALUES ('link-red-conflict', 'variant-two', 'option-ink', 'value-red')
      `),
    ).rejects.toThrow();

    const links = await database.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count
      FROM product_variant_option_values
      WHERE variant_id = 'variant-two'
    `);
    expect(Number(links[0].count)).toBe(2);
  });

  it('allows multiple media rows but only one primary per product or variant gallery', async () => {
    await database.runSql(`
      INSERT INTO product_media (
        id, product_id, variant_id, type, url, sort_order,
        is_primary, created_at, updated_at
      ) VALUES
        ('media-general-primary', 'product-simple', NULL, 'IMAGE', 'general-1', 1, TRUE, NOW(), NOW()),
        ('media-general-secondary', 'product-simple', NULL, 'IMAGE', 'general-2', 2, FALSE, NOW(), NOW()),
        ('media-variant-primary', 'product-simple', 'variant-simple', 'IMAGE', 'variant-1', 1, TRUE, NOW(), NOW()),
        ('media-variant-secondary', 'product-simple', 'variant-simple', 'IMAGE', 'variant-2', 2, FALSE, NOW(), NOW())
    `);

    await expect(
      database.runSql(`
        INSERT INTO product_media (
          id, product_id, type, url, sort_order, is_primary, created_at, updated_at
        ) VALUES ('media-general-conflict', 'product-simple', 'IMAGE', 'general-3', 3, TRUE, NOW(), NOW())
      `),
    ).rejects.toThrow();

    await expect(
      database.runSql(`
        INSERT INTO product_media (
          id, product_id, variant_id, type, url, sort_order,
          is_primary, created_at, updated_at
        ) VALUES (
          'media-variant-conflict', 'product-simple', 'variant-simple',
          'IMAGE', 'variant-3', 3, TRUE, NOW(), NOW()
        )
      `),
    ).rejects.toThrow();
  });

  it('keeps DRAFT receipts stock-neutral and confirms each receipt once', async () => {
    await createReceipt(database, 'receipt-one', 'RECEIPT-ONE', 5);
    expect(await stockQuantity(database)).toBe(0);

    await confirmReceipt(database, 'receipt-one');
    expect(await stockQuantity(database)).toBe(5);

    await confirmReceipt(database, 'receipt-one');
    expect(await stockQuantity(database)).toBe(5);
  });

  it('uses atomic increments when two receipts confirm concurrently', async () => {
    await createReceipt(database, 'receipt-two', 'RECEIPT-TWO', 7);
    await createReceipt(database, 'receipt-three', 'RECEIPT-THREE', 11);

    const first = new Client({ connectionString: database.databaseUrl });
    const second = new Client({ connectionString: database.databaseUrl });
    await Promise.all([first.connect(), second.connect()]);
    try {
      await Promise.all([
        confirmReceiptWithClient(first, 'receipt-two'),
        confirmReceiptWithClient(second, 'receipt-three'),
      ]);
    } finally {
      await Promise.all([first.end(), second.end()]);
    }

    expect(await stockQuantity(database)).toBe(23);
  });

  it('confirms the same receipt concurrently only once', async () => {
    await createReceipt(database, 'receipt-four', 'RECEIPT-FOUR', 13);
    const first = new Client({ connectionString: database.databaseUrl });
    const second = new Client({ connectionString: database.databaseUrl });
    await Promise.all([first.connect(), second.connect()]);
    try {
      await Promise.all([
        confirmReceiptWithClient(first, 'receipt-four'),
        confirmReceiptWithClient(second, 'receipt-four'),
      ]);
    } finally {
      await Promise.all([first.end(), second.end()]);
    }

    expect(await stockQuantity(database)).toBe(36);
  });

  it('enforces Phase 11 threshold and history references', async () => {
    await expect(
      database.runSql(`
        UPDATE branch_product_stocks SET low_stock_threshold = -1
        WHERE branch_id = 'branch-one' AND variant_id = 'variant-simple'
      `),
    ).rejects.toThrow();

    await database.runSql(`
      INSERT INTO suppliers (id, name, slug, created_at, updated_at)
      VALUES ('supplier-inventory', 'Inventory Supplier', 'inventory-supplier', NOW(), NOW());
      INSERT INTO stock_receipts (
        id, branch_id, supplier_id, code, status, created_at, updated_at
      ) VALUES (
        'receipt-supplier', 'branch-one', 'supplier-inventory',
        'RECEIPT-SUPPLIER', 'DRAFT', NOW(), NOW()
      );
    `);

    await expect(
      database.runSql(`DELETE FROM suppliers WHERE id = 'supplier-inventory'`),
    ).rejects.toThrow();
    await expect(
      database.runSql(
        `DELETE FROM product_variants WHERE id = 'variant-simple'`,
      ),
    ).rejects.toThrow();
  });

  it('rejects invalid stock, receipt, cart, and order quantities', async () => {
    await expect(
      database.runSql(`
        UPDATE branch_product_stocks SET quantity = -1
        WHERE branch_id = 'branch-one' AND variant_id = 'variant-simple'
      `),
    ).rejects.toThrow();

    await database.runSql(`
      INSERT INTO stock_receipts (
        id, branch_id, code, status, created_at, updated_at
      ) VALUES (
        'invalid-receipt', 'branch-one', 'INVALID-RECEIPT',
        'DRAFT', NOW(), NOW()
      )
    `);

    await expect(
      database.runSql(`
        INSERT INTO stock_receipt_items (
          id, receipt_id, variant_id, quantity, created_at, updated_at
        ) VALUES ('invalid-receipt-item', 'invalid-receipt', 'variant-simple', 0, NOW(), NOW())
      `),
    ).rejects.toThrow();

    await database.runSql(`
      INSERT INTO carts (id, user_id, branch_id, created_at, updated_at)
      VALUES ('cart-one', 'user-one', 'branch-one', NOW(), NOW());

      INSERT INTO orders (
        id, order_code, user_id, branch_id, status,
        subtotal_amount, discount_amount, shipping_fee, total_amount,
        receiver_name, receiver_phone, shipping_address, created_at, updated_at
      ) VALUES (
        'order-one', 'ORDER-ONE', 'user-one', 'branch-one', 'PENDING',
        100, 0, 0, 100, 'Receiver', '0123456789', 'Address', NOW(), NOW()
      )
    `);

    await expect(
      database.runSql(`
        INSERT INTO cart_items (
          id, cart_id, variant_id, quantity, last_known_unit_price, created_at, updated_at
        ) VALUES ('invalid-cart-item', 'cart-one', 'variant-simple', 0, 100, NOW(), NOW())
      `),
    ).rejects.toThrow();

    await expect(
      database.runSql(`
        INSERT INTO order_items (
          id, order_id, variant_id, name, quantity,
          unit_price, total_price, created_at
        ) VALUES (
          'invalid-order-item', 'order-one', 'variant-simple', 'Invalid',
          0, 100, 0, NOW()
        )
      `),
    ).rejects.toThrow();
  });
});

async function seedBaseData(
  database: DisposablePostgresDatabase,
): Promise<void> {
  await database.runSql(`
    INSERT INTO users (id, email, created_at, updated_at)
    VALUES ('user-one', 'schema-refactor@example.com', NOW(), NOW());

    INSERT INTO branches (
      id, name, code, address, is_active, created_at, updated_at
    ) VALUES ('branch-one', 'Branch One', 'B1', 'Address', TRUE, NOW(), NOW())
  `);
}

async function createReceipt(
  database: DisposablePostgresDatabase,
  receiptId: string,
  code: string,
  quantity: number,
): Promise<void> {
  await database.query(
    `
      INSERT INTO stock_receipts (
        id, branch_id, code, status, created_at, updated_at
      ) VALUES ($1, 'branch-one', $2, 'DRAFT', NOW(), NOW())
    `,
    [receiptId, code],
  );
  await database.query(
    `
      INSERT INTO stock_receipt_items (
        id, receipt_id, variant_id, quantity, created_at, updated_at
      ) VALUES ($1 || '-item', $1, 'variant-simple', $2, NOW(), NOW())
    `,
    [receiptId, quantity],
  );
}

async function confirmReceipt(
  database: DisposablePostgresDatabase,
  receiptId: string,
): Promise<void> {
  const client = new Client({ connectionString: database.databaseUrl });
  await client.connect();
  try {
    await confirmReceiptWithClient(client, receiptId);
  } finally {
    await client.end();
  }
}

async function confirmReceiptWithClient(
  client: Client,
  receiptId: string,
): Promise<void> {
  await client.query('BEGIN');
  try {
    const updated = await client.query<{ id: string }>(
      `
        UPDATE stock_receipts
        SET status = 'CONFIRMED', confirmed_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND status = 'DRAFT'
        RETURNING id
      `,
      [receiptId],
    );
    if (updated.rowCount === 1) {
      await client.query(
        `
          INSERT INTO branch_product_stocks (
            id, branch_id, variant_id, quantity,
            low_stock_threshold, created_at, updated_at
          )
          SELECT
            $1 || '-stock', receipt.branch_id, item.variant_id, item.quantity,
            5, NOW(), NOW()
          FROM stock_receipts receipt
          JOIN stock_receipt_items item ON item.receipt_id = receipt.id
          WHERE receipt.id = $1
          ON CONFLICT (branch_id, variant_id)
          DO UPDATE SET
            quantity = branch_product_stocks.quantity + EXCLUDED.quantity,
            updated_at = NOW()
        `,
        [receiptId],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function stockQuantity(
  database: DisposablePostgresDatabase,
): Promise<number> {
  const rows = await database.query<{ quantity: number }>(`
    SELECT quantity
    FROM branch_product_stocks
    WHERE branch_id = 'branch-one' AND variant_id = 'variant-simple'
  `);
  return rows[0]?.quantity ?? 0;
}
