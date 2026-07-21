import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { loadEnvFile } from '../src/config/env.loader';
import { seedCatalog } from './catalog.seed';
import { seedCategories } from './seed/categories.seed';
import { seedProductMasterData } from './seed/product-master-data.seed';

async function seed(): Promise<void> {
  loadEnvFile();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to seed authorization data');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });

  try {
    await prisma.$transaction(async (tx) => {
      await seedCatalog(tx);
      await seedCategories(tx);
      await seedProductMasterData(tx);
    });
  } finally {
    await prisma.$disconnect();
  }
}

void seed();
