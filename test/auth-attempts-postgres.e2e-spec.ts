import { PrismaPg } from '@prisma/adapter-pg';
import { AuthAttemptType, PrismaClient } from '../src/generated/prisma/client';
import { AuthAttemptsRepository } from '../src/modules/auth/auth-attempts.repository';
import { AuthAttemptService } from '../src/modules/auth/auth-attempt.service';
import {
  createDisposablePostgresDatabase,
  runMigrations,
  type DisposablePostgresDatabase,
} from './helpers/postgres-test-database';

describe('atomic login attempts PostgreSQL fixture (e2e)', () => {
  jest.setTimeout(120_000);

  it('increments, locks, avoids lock extension, resets, and handles concurrency', async () => {
    const database = await createDisposablePostgresDatabase('auth_attempts');
    let prisma: PrismaClient | undefined;

    try {
      await runMigrations(database);
      prisma = createPrisma(database);
      await prisma.$connect();

      const service = createService(prisma, {
        emailMaxFailedAttempts: 3,
        emailLockSeconds: 60,
        ipMaxFailedAttempts: 100,
        ipLockSeconds: 120,
        attemptWindowSeconds: 60,
      });

      await service.recordLoginFailure('USER@example.com', '127.0.0.1');
      await expectAttempt(prisma, AuthAttemptType.EMAIL, 'user@example.com', 1);

      await service.recordLoginFailure('user@example.com', '127.0.0.1');
      await expectAttempt(prisma, AuthAttemptType.EMAIL, 'user@example.com', 2);

      await expect(
        service.recordLoginFailure('user@example.com', '127.0.0.1'),
      ).rejects.toMatchObject({ status: 429 });
      const lockedAttempt = await getAttempt(
        prisma,
        AuthAttemptType.EMAIL,
        'user@example.com',
      );
      expect(lockedAttempt?.attempts).toBe(3);
      expect(lockedAttempt?.blockedUntil).toBeInstanceOf(Date);

      await expect(
        service.checkLoginBlocked('user@example.com', '127.0.0.1'),
      ).rejects.toMatchObject({ status: 429 });
      const stillLockedAttempt = await getAttempt(
        prisma,
        AuthAttemptType.EMAIL,
        'user@example.com',
      );
      expect(stillLockedAttempt?.attempts).toBe(3);
      expect(stillLockedAttempt?.blockedUntil?.getTime()).toBe(
        lockedAttempt?.blockedUntil?.getTime(),
      );

      await service.resetLoginAttempts('user@example.com', '127.0.0.1');
      const resetAttempt = await getAttempt(
        prisma,
        AuthAttemptType.EMAIL,
        'user@example.com',
      );
      expect(resetAttempt).toMatchObject({
        attempts: 0,
        windowStartedAt: null,
        blockedUntil: null,
      });

      const concurrentService = createService(prisma, {
        emailMaxFailedAttempts: 20,
        emailLockSeconds: 60,
        ipMaxFailedAttempts: 100,
        ipLockSeconds: 120,
        attemptWindowSeconds: 60,
      });
      await Promise.all(
        Array.from({ length: 8 }, () =>
          concurrentService.recordLoginFailure(
            'concurrent@example.com',
            '127.0.0.2',
          ),
        ),
      );
      await expectAttempt(
        prisma,
        AuthAttemptType.EMAIL,
        'concurrent@example.com',
        8,
      );
    } finally {
      await prisma?.$disconnect();
      await database.close();
    }
  });
});

function createPrisma(database: DisposablePostgresDatabase): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: database.databaseUrl }),
  });
}

function createService(
  prisma: PrismaClient,
  configValues: {
    emailMaxFailedAttempts: number;
    emailLockSeconds: number;
    ipMaxFailedAttempts: number;
    ipLockSeconds: number;
    attemptWindowSeconds: number;
  },
): AuthAttemptService {
  const repository = new AuthAttemptsRepository(prisma as never);
  const config = {
    get: jest.fn((key: string) => {
      const values: Record<string, number> = {
        'auth.login.emailMaxFailedAttempts':
          configValues.emailMaxFailedAttempts,
        'auth.login.emailLockSeconds': configValues.emailLockSeconds,
        'auth.login.ipMaxFailedAttempts': configValues.ipMaxFailedAttempts,
        'auth.login.ipLockSeconds': configValues.ipLockSeconds,
        'auth.login.attemptWindowSeconds': configValues.attemptWindowSeconds,
      };
      return values[key];
    }),
  };
  return new AuthAttemptService(repository, config as never);
}

async function expectAttempt(
  prisma: PrismaClient,
  type: AuthAttemptType,
  key: string,
  attempts: number,
): Promise<void> {
  await expect(getAttempt(prisma, type, key)).resolves.toMatchObject({
    attempts,
  });
}

function getAttempt(prisma: PrismaClient, type: AuthAttemptType, key: string) {
  return prisma.authAttempt.findUnique({
    where: { type_key: { type, key } },
  });
}
