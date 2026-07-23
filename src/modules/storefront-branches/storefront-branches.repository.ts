import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';

@Injectable()
export class StorefrontBranchesRepository {
  constructor(private readonly prisma: PrismaService) {}

  listActive() {
    return this.prisma.branch.findMany({
      where: { isActive: true },
      orderBy: [{ name: 'asc' }, { code: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        address: true,
        province: true,
        ward: true,
      },
    });
  }
}
