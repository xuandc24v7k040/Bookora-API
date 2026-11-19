import { ConflictException } from '@nestjs/common';
import { Prisma } from '@/generated/prisma/client';
import {
  isTransactionConflict,
  runSerializableTransaction,
} from './serializable-transaction.util';
function error(code: string, sqlstate?: string) {
  return new Prisma.PrismaClientKnownRequestError('transaction fixture', {
    code,
    clientVersion: '7.8.0',
    meta: sqlstate ? { code: sqlstate } : undefined,
  });
}
describe('Serializable transaction bounded retry', () => {
  it.each([
    ['P2034', undefined],
    ['P2010', '40001'],
    ['P2010', '40P01'],
  ])('retries only transient %s / %s', async (code, sqlstate) => {
    const result = error(code, sqlstate);
    expect(isTransactionConflict(result)).toBe(true);
    const runner = {
      $transaction: jest
        .fn()
        .mockRejectedValueOnce(result)
        .mockResolvedValue('saved'),
    };
    expect(
      await runSerializableTransaction(runner, () => Promise.resolve('saved')),
    ).toBe('saved');
    expect(runner.$transaction).toHaveBeenCalledTimes(2);
  });
  it.each([
    ['P2002', undefined],
    ['P2010', '23505'],
    ['P2010', '42601'],
    ['P2010', undefined],
  ])('does not retry persistent error %s/%s', async (code, sqlstate) => {
    const result = error(code, sqlstate);
    expect(isTransactionConflict(result)).toBe(false);
    const runner = { $transaction: jest.fn().mockRejectedValue(result) };
    await expect(
      runSerializableTransaction(runner, () => Promise.resolve(null)),
    ).rejects.toBe(result);
    expect(runner.$transaction).toHaveBeenCalledTimes(1);
  });
  it('retains the existing three attempt bound', async () => {
    const runner = {
      $transaction: jest.fn().mockRejectedValue(error('P2010', '40001')),
    };
    await expect(
      runSerializableTransaction(runner, () => Promise.resolve(null)),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(runner.$transaction).toHaveBeenCalledTimes(3);
  });
  it('recognizes the installed adapter-pg error shape without matching arbitrary SQL errors', () => {
    const wrapped = (originalCode: string) =>
      new Prisma.PrismaClientKnownRequestError('raw lock', {
        code: 'P2010',
        clientVersion: '7.8.0',
        meta: {
          driverAdapterError: {
            cause: { originalCode, kind: 'TransactionWriteConflict' },
          },
        },
      });
    expect(isTransactionConflict(wrapped('40001'))).toBe(true);
    expect(isTransactionConflict(wrapped('40P01'))).toBe(true);
    expect(isTransactionConflict(wrapped('23505'))).toBe(false);
  });
});
