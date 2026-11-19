import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/database/prisma.service';
import { runSerializableTransaction } from '@/database/serializable-transaction.util';
import {
  createDisposablePostgresDatabase,
  type DisposablePostgresDatabase,
} from './helpers/postgres-test-database';

describe('Serializable SELECT FOR UPDATE retries with PostgreSQL adapter', () => {
  let database: DisposablePostgresDatabase;
  let prisma: PrismaService;
  beforeAll(async () => {
    database = await createDisposablePostgresDatabase('raw_lock_retry');
    await database.runSql(
      'CREATE TABLE lock_retry_fixture (id integer PRIMARY KEY, value integer NOT NULL); INSERT INTO lock_retry_fixture VALUES (1,0)',
    );
    prisma = new PrismaService({
      getOrThrow: () => database.databaseUrl,
      get: () => 'test',
    } as unknown as ConfigService);
    await prisma.$connect();
  });
  afterAll(async () => {
    await prisma?.$disconnect();
    await database?.close();
  });
  it('retries the transaction when a raw row lock observes a concurrent committed update', async () => {
    let attempts = 0;
    const result = await runSerializableTransaction(prisma, async (tx) => {
      attempts++;
      await tx.$queryRaw`SELECT id FROM lock_retry_fixture WHERE id = 1`;
      if (attempts === 1)
        await prisma.$executeRaw`UPDATE lock_retry_fixture SET value = value + 1 WHERE id = 1`;
      const rows = await tx.$queryRaw<
        Array<{ value: number }>
      >`SELECT value FROM lock_retry_fixture WHERE id = 1 FOR UPDATE`;
      return rows[0].value;
    });
    expect(attempts).toBe(2);
    expect(result).toBe(1);
  });
});
