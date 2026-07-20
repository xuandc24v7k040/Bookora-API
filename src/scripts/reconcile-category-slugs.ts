import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@/generated/prisma/client';
import { loadEnvFile } from '@/config/env.loader';
import {
  buildCategorySlugReconciliationPlan,
  CategorySlugReconciliationError,
  type CategorySlugChange,
  type CategorySlugRecord,
} from '@/modules/categories/category-slug.util';

const CATEGORY_SELECT = {
  id: true,
  name: true,
  slug: true,
  parentId: true,
} as const;

function buildTemporarySlugs(
  records: readonly CategorySlugRecord[],
  changes: readonly CategorySlugChange[],
): Map<string, string> {
  const used = new Set(records.map((record) => record.slug));
  const temporarySlugs = new Map<string, string>();
  for (const change of changes) {
    let suffix = 0;
    let temporarySlug = `__category_slug_reconcile__${change.id}`;
    while (used.has(temporarySlug)) {
      suffix += 1;
      temporarySlug = `__category_slug_reconcile__${change.id}_${suffix}`;
    }
    used.add(temporarySlug);
    temporarySlugs.set(change.id, temporarySlug);
  }
  return temporarySlugs;
}

async function main(): Promise<void> {
  const unknownArguments = process.argv
    .slice(2)
    .filter((argument) => argument !== '--dry-run' && argument !== '--apply');
  const apply = process.argv.includes('--apply');
  if (
    unknownArguments.length > 0 ||
    (apply && process.argv.includes('--dry-run'))
  ) {
    throw new Error(
      'Usage: npm run categories:slug-reconcile -- [--dry-run|--apply]',
    );
  }

  loadEnvFile();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });

  try {
    const records = await prisma.category.findMany({ select: CATEGORY_SELECT });
    const plan = buildCategorySlugReconciliationPlan(records);
    console.info(
      JSON.stringify(
        {
          mode: apply ? 'apply' : 'dry-run',
          categoryCount: records.length,
          changeCount: plan.length,
          changes: plan.map(({ id, name, slug, nextSlug, parentId }) => ({
            id,
            name,
            parentId,
            from: slug,
            to: nextSlug,
          })),
        },
        null,
        2,
      ),
    );
    if (!apply || plan.length === 0) return;

    const appliedCount = await prisma.$transaction(
      async (tx) => {
        const latestRecords = await tx.category.findMany({
          select: CATEGORY_SELECT,
        });
        const latestPlan = buildCategorySlugReconciliationPlan(latestRecords);
        const temporarySlugs = buildTemporarySlugs(latestRecords, latestPlan);

        for (const change of latestPlan) {
          await tx.category.update({
            where: { id: change.id },
            data: { slug: temporarySlugs.get(change.id)! },
          });
        }
        for (const change of latestPlan) {
          await tx.category.update({
            where: { id: change.id },
            data: { slug: change.nextSlug },
          });
        }
        return latestPlan.length;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    console.info(`Applied ${appliedCount} category slug change(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  if (error instanceof CategorySlugReconciliationError) {
    console.error(
      JSON.stringify(
        { error: error.message, conflicts: error.conflicts },
        null,
        2,
      ),
    );
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
