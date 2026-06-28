import { ConflictException } from '@nestjs/common';
import { Prisma } from '@/generated/prisma/client';

const DEFAULT_MAX_ATTEMPTS = 3;

interface SerializableTransactionRunner {
  $transaction<T>(
    callback: (tx: Prisma.TransactionClient) => Promise<T>,
    options: { isolationLevel: Prisma.TransactionIsolationLevel },
  ): Promise<T>;
}

export async function runSerializableTransaction<T>(
  prisma: SerializableTransactionRunner,
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await prisma.$transaction(callback, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (!isTransactionConflict(error)) {
        throw error;
      }

      if (attempt === maxAttempts) {
        throw new ConflictException(
          'Authorization data changed concurrently, please retry',
        );
      }
    }
  }

  throw new ConflictException(
    'Authorization data changed concurrently, please retry',
  );
}

export function isTransactionConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2034'
  );
}
