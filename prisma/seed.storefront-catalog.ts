import { PrismaPg } from '@prisma/adapter-pg';
import { loadEnvFile } from '../src/config/env.loader';
import { PrismaClient } from '../src/generated/prisma/client';
import { seedCatalog } from './catalog.seed';
import { seedCategories } from './seed/categories.seed';
import { seedProductMasterData } from './seed/product-master-data.seed';
import { seedStorefrontCatalogDemo } from './seed/storefront-catalog/storefront-catalog.seed';

async function seed(): Promise<void> {
  loadEnvFile();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
  try {
    await prisma.$transaction(async (tx) => {
      await seedCatalog(tx);
      await seedCategories(tx);
      await seedProductMasterData(tx);
    });
    const summary = await seedStorefrontCatalogDemo(prisma);
    console.log('Bookora storefront demo catalog seed', summary);
  } finally {
    await prisma.$disconnect();
  }
}

void seed();
