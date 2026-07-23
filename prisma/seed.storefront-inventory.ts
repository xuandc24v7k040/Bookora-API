import { PrismaPg } from '@prisma/adapter-pg';
import { loadEnvFile } from '../src/config/env.loader';
import { PrismaClient } from '../src/generated/prisma/client';
import { seedStorefrontInventoryDemo } from './seed/storefront-catalog/storefront-inventory.seed';

async function seed(): Promise<void> {
  loadEnvFile();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
  try {
    const summary = await seedStorefrontInventoryDemo(prisma);
    console.log('Bookora storefront demo inventory seed', summary);
  } finally {
    await prisma.$disconnect();
  }
}

void seed();
