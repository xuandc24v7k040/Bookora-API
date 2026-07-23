import { Injectable } from '@nestjs/common';
import { Prisma, ProductMediaType } from '@/generated/prisma/client';
import { PrismaService } from '@/database/prisma.service';

const cartInclude = {
  branch: true,
  items: {
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
    include: {
      variant: {
        include: {
          product: {
            include: {
              authors: {
                orderBy: { author: { name: 'asc' as const } },
                include: { author: true },
              },
              media: {
                where: {
                  type: ProductMediaType.IMAGE,
                  variantId: null,
                },
                orderBy: [
                  { isPrimary: 'desc' as const },
                  { sortOrder: 'asc' as const },
                  { id: 'asc' as const },
                ],
              },
            },
          },
          media: {
            where: { type: ProductMediaType.IMAGE },
            orderBy: [
              { isPrimary: 'desc' as const },
              { sortOrder: 'asc' as const },
              { id: 'asc' as const },
            ],
          },
          optionValues: {
            include: { option: true, optionValue: true },
            orderBy: { option: { sortOrder: 'asc' as const } },
          },
          stocks: true,
        },
      },
    },
  },
} satisfies Prisma.CartInclude;

export type CartRecord = Prisma.CartGetPayload<{ include: typeof cartInclude }>;

@Injectable()
export class CartRepository {
  constructor(private readonly prisma: PrismaService) {}

  findBranch(branchId: string) {
    return this.prisma.branch.findUnique({ where: { id: branchId } });
  }

  findCart(userId: string) {
    return this.prisma.cart.findUnique({
      where: { userId },
      include: cartInclude,
    });
  }

  findVariant(variantId: string, branchId: string) {
    return this.prisma.productVariant.findUnique({
      where: { id: variantId },
      include: {
        product: true,
        stocks: { where: { branchId } },
      },
    });
  }

  async syncBranch(userId: string, branchId: string) {
    await this.prisma.cart.upsert({
      where: { userId },
      create: { userId, branchId },
      update: { branchId },
    });
    return this.findCart(userId);
  }

  async addItem(
    userId: string,
    branchId: string,
    variantId: string,
    quantity: number,
    availableQuantity: number,
    lastKnownUnitPrice: number,
  ): Promise<'ok' | 'quantity-exceeded'> {
    return this.serializable(async (tx) => {
      const cart = await tx.cart.upsert({
        where: { userId },
        create: { userId, branchId },
        update: { branchId },
        select: { id: true },
      });
      const current = await tx.cartItem.findUnique({
        where: { cartId_variantId: { cartId: cart.id, variantId } },
        select: { quantity: true },
      });
      if ((current?.quantity ?? 0) + quantity > availableQuantity) {
        return 'quantity-exceeded';
      }
      await tx.cartItem.upsert({
        where: { cartId_variantId: { cartId: cart.id, variantId } },
        create: {
          cartId: cart.id,
          variantId,
          quantity,
          lastKnownUnitPrice,
        },
        update: {
          quantity: { increment: quantity },
          lastKnownUnitPrice,
        },
      });
      return 'ok';
    });
  }

  async updateQuantity(
    userId: string,
    itemId: string,
    quantity: number,
    lastKnownUnitPrice: number,
  ) {
    const result = await this.prisma.cartItem.updateMany({
      where: { id: itemId, cart: { userId } },
      data: { quantity, lastKnownUnitPrice },
    });
    return result.count > 0;
  }

  async deleteItem(userId: string, itemId: string) {
    const result = await this.prisma.cartItem.deleteMany({
      where: { id: itemId, cart: { userId } },
    });
    return result.count > 0;
  }

  findOwnedItem(userId: string, itemId: string) {
    return this.prisma.cartItem.findFirst({
      where: { id: itemId, cart: { userId } },
      select: { id: true, variantId: true },
    });
  }

  private async serializable<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (
          attempt < 2 &&
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034'
        ) {
          continue;
        }
        throw error;
      }
    }
    throw new Error('Không thể hoàn tất giao dịch giỏ hàng.');
  }
}
