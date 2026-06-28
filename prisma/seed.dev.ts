import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { loadEnvFile } from '../src/config/env.loader';
import {
  DEVELOPMENT_BRANCHES,
  DEVELOPMENT_PASSWORD,
  DEVELOPMENT_USERS,
  assertDevelopmentSeedAllowed,
  seedDevelopmentFixtures,
} from './development.seed';

async function seed(): Promise<void> {
  loadEnvFile();
  assertDevelopmentSeedAllowed(process.env);

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to seed development fixtures');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });

  try {
    await seedDevelopmentFixtures(prisma);
    printDevelopmentCredentials();
  } finally {
    await prisma.$disconnect();
  }
}

function printDevelopmentCredentials(): void {
  console.log('Bookora development fixtures seeded');
  console.log('');
  console.log('Branches:');
  for (const branch of DEVELOPMENT_BRANCHES) {
    console.log(`- ${branch.name.replace('Chi nhánh ', '')}`);
  }
  console.log('');
  console.log('Users:');
  for (const user of DEVELOPMENT_USERS) {
    console.log(`- ${user.email}`);
  }
  console.log('');
  console.log('Development password:');
  console.log(DEVELOPMENT_PASSWORD);
}

void seed();
