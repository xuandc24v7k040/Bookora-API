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
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === 'P2034') return true;
  // PostgreSQL row locks issued via $queryRaw retain SQLSTATE under P2010.
  if (error.code !== 'P2010') return false;
  const adapterError: unknown = error.meta?.driverAdapterError;
  const cause: unknown =
    adapterError && typeof adapterError === 'object' && 'cause' in adapterError
      ? adapterError.cause
      : undefined;
  const sqlstate: unknown =
    error.meta?.code ??
    (cause && typeof cause === 'object' && 'originalCode' in cause
      ? cause.originalCode
      : undefined);
  return sqlstate === '40001' || sqlstate === '40P01';
}
