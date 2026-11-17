import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { loadEnvFile } from '../src/config/env.loader';
import { assertDevelopmentSeedAllowed } from './development.seed';
import { seedDemoCoupons } from './seed/coupons.seed';

async function seed(): Promise<void> {
  loadEnvFile();
  assertDevelopmentSeedAllowed(process.env);
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
  try {
    await prisma.$transaction((tx) => seedDemoCoupons(tx));
  } finally {
    await prisma.$disconnect();
  }
}
void seed();
