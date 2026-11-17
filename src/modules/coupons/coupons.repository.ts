import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { runSerializableTransaction } from '@/database/serializable-transaction.util';
import type { Prisma } from '@/generated/prisma/client';

@Injectable()
export class CouponsRepository {
  constructor(readonly client: PrismaService) {}
  transaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return runSerializableTransaction(this.client, operation);
  }
}
