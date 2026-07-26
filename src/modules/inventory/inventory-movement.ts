import {
  InventoryMovementSourceType,
  InventoryMovementType,
  type Prisma,
} from '@/generated/prisma/client';

export interface RecordInventoryMovementInput {
  branchId: string;
  variantId: string;
  type: InventoryMovementType;
  quantityChange: number;
  beforeQuantity: number;
  afterQuantity: number;
  reason?: string | null;
  sourceType: InventoryMovementSourceType;
  sourceId: string;
  sourceCode?: string | null;
  actorId?: string | null;
  receiptId?: string | null;
}

export function recordInventoryMovement(
  tx: Prisma.TransactionClient,
  input: RecordInventoryMovementInput,
) {
  return tx.inventoryMovement.create({
    data: {
      branchId: input.branchId,
      variantId: input.variantId,
      type: input.type,
      quantityChange: input.quantityChange,
      beforeQuantity: input.beforeQuantity,
      afterQuantity: input.afterQuantity,
      reason: input.reason ?? null,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      sourceCode: input.sourceCode ?? null,
      actorId: input.actorId ?? null,
      receiptId: input.receiptId ?? null,
    },
  });
}
