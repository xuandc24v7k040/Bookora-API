import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { backfillMembership } from '@/modules/membership/membership-backfill';

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  const apply = process.argv.includes('--apply');
  const confirmedDevelopment =
    process.env.NODE_ENV === 'development' &&
    process.argv.includes(
      `--confirmed-local-development=${url.pathname.slice(1)}`,
    );
  // No production/shared writes via this operator command. Deployment needs an explicit reviewed runbook.
  if (
    apply &&
    (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      (!/^\/(bookora_it_|bookora_test_|bookora_dev_)/.test(url.pathname) &&
        !confirmedDevelopment))
  )
    throw new Error(
      'Apply requires a verified local development/test database named bookora_it_*, bookora_test_* or bookora_dev_*.',
    );
  console.log(
    JSON.stringify({
      mode: apply ? 'APPLY' : 'DRY_RUN',
      host: url.hostname,
      database: url.pathname.slice(1),
    }),
  );
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url.toString() }),
  });
  try {
    const report = await backfillMembership(prisma, {
      apply,
      onProgress: (value) => console.log(JSON.stringify(value)),
    });
    console.log(JSON.stringify(report));
    if (report.invalid || report.reconciliationErrors) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
void main().catch(() => {
  console.error(
    'Membership backfill failed. Review the sanitized progress log and database target.',
  );
  process.exitCode = 1;
});
