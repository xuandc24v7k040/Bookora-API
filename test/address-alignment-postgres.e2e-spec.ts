import {
  createDisposablePostgresDatabase,
  readMigrationSql,
  runMigrations,
} from './helpers/postgres-test-database';

describe('two-level address PostgreSQL migration (e2e)', () => {
  jest.setTimeout(120_000);

  it('preserves legacy district text and coordinates before dropping district columns', async () => {
    const database =
      await createDisposablePostgresDatabase('address_alignment');
    try {
      await runMigrations(database, ['20260604082015_init']);
      await database.runSql(`
        INSERT INTO "users" ("id", "email", "updated_at")
        VALUES ('01K20000000000000000000001', 'address@example.test', CURRENT_TIMESTAMP);

        INSERT INTO "branches"
          ("id", "name", "code", "address", "province", "district", "ward", "latitude", "longitude", "updated_at")
        VALUES
          (
            '01K20000000000000000000002',
            'Needs preservation',
            'needs-preservation',
            'Số 1 đường Trung Tâm',
            'Cần Thơ',
            'Ninh Kiều',
            'Xuân Khánh',
            10.0452000,
            105.7469000,
            CURRENT_TIMESTAMP
          ),
          (
            '01K20000000000000000000003',
            'Already preserved',
            'already-preserved',
            'Số 2, Ninh Kiều, Cần Thơ',
            'Cần Thơ',
            'Ninh Kiều',
            'Xuân Khánh',
            NULL,
            NULL,
            CURRENT_TIMESTAMP
          );

        INSERT INTO "user_addresses"
          ("id", "user_id", "receiver_name", "receiver_phone", "province", "district", "ward", "detail", "ghn_district_id", "latitude", "longitude", "updated_at")
        VALUES (
          '01K20000000000000000000004',
          '01K20000000000000000000001',
          'Receiver',
          '0901234567',
          'Cần Thơ',
          'Ninh Kiều',
          'Xuân Khánh',
          'Số 3 đường Trung Tâm',
          1442,
          10.0452000,
          105.7469000,
          CURRENT_TIMESTAMP
        );
      `);

      await database.runSql(
        readMigrationSql('20260714170000_two_level_addresses'),
      );

      const branches = await database.query<{
        code: string;
        address: string;
        latitude: string | null;
        longitude: string | null;
      }>(`
        SELECT code, address, latitude::text, longitude::text
        FROM branches
        ORDER BY code
      `);
      expect(branches).toEqual([
        {
          code: 'already-preserved',
          address: 'Số 2, Ninh Kiều, Cần Thơ',
          latitude: null,
          longitude: null,
        },
        {
          code: 'needs-preservation',
          address: 'Số 1 đường Trung Tâm, Ninh Kiều',
          latitude: '10.0452000',
          longitude: '105.7469000',
        },
      ]);

      await expect(
        database.query<{ detail: string; latitude: string; longitude: string }>(
          `
            SELECT detail, latitude::text, longitude::text
            FROM user_addresses
          `,
        ),
      ).resolves.toEqual([
        {
          detail: 'Số 3 đường Trung Tâm, Ninh Kiều',
          latitude: '10.0452000',
          longitude: '105.7469000',
        },
      ]);

      const obsoleteColumns = await database.query<{ column_name: string }>(
        `
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND (
              (table_name = 'branches' AND column_name = 'district')
              OR (
                table_name = 'user_addresses'
                AND column_name IN ('district', 'ghn_district_id')
              )
            )
        `,
      );
      expect(obsoleteColumns).toEqual([]);
    } finally {
      await database.close();
    }
  });
});
