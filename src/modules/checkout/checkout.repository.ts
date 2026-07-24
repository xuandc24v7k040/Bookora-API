import { Injectable } from '@nestjs/common';
import { Prisma, ProductMediaType } from '@/generated/prisma/client';
import { PrismaService } from '@/database/prisma.service';
import { runSerializableTransaction } from '@/database/serializable-transaction.util';

const checkoutCartInclude = {
  branch: true,
  items: {
    include: {
      variant: {
        include: {
          product: {
            include: {
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
                take: 1,
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
            take: 1,
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

export type CheckoutCartRecord = Prisma.CartGetPayload<{
  include: typeof checkoutCartInclude;
}>;

@Injectable()
export class CheckoutRepository {
  constructor(private readonly prisma: PrismaService) {}

  findCart(userId: string) {
    return this.prisma.cart.findUnique({
      where: { userId },
      include: checkoutCartInclude,
    });
  }

  findOwnedAddress(userId: string, id: string) {
    return this.prisma.userAddress.findFirst({ where: { id, userId } });
  }

  updateAddressMapping(
    id: string,
    data: Pick<
      Prisma.UserAddressUpdateInput,
      'ghnProvinceId' | 'ghnDistrictId' | 'ghnWardCode' | 'ghnMappingVerifiedAt'
    >,
  ) {
    return this.prisma.userAddress.update({ where: { id }, data });
  }

  updateAddressResolution(
    id: string,
    data: Pick<
      Prisma.UserAddressUpdateInput,
      | 'latitude'
      | 'longitude'
      | 'ghnProvinceId'
      | 'ghnDistrictId'
      | 'ghnWardCode'
      | 'ghnMappingVerifiedAt'
    >,
  ) {
    return this.prisma.userAddress.update({ where: { id }, data });
  }

  updateBranchMapping(
    id: string,
    data: Pick<
      Prisma.BranchUpdateInput,
      'ghnProvinceId' | 'ghnDistrictId' | 'ghnWardCode' | 'ghnMappingVerifiedAt'
    >,
  ) {
    return this.prisma.branch.update({ where: { id }, data });
  }

  updateBranchResolution(
    id: string,
    data: Pick<
      Prisma.BranchUpdateInput,
      | 'latitude'
      | 'longitude'
      | 'ghnProvinceId'
      | 'ghnDistrictId'
      | 'ghnWardCode'
      | 'ghnMappingVerifiedAt'
    >,
  ) {
    return this.prisma.branch.update({ where: { id }, data });
  }

  transaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) {
    return runSerializableTransaction(this.prisma, operation);
  }

  get client(): PrismaService {
    return this.prisma;
  }
}
