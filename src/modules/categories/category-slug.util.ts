import { toSlug } from '@/common/utils/slug.util';

export interface CategorySlugRecord {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
}

export interface CategorySlugChange extends CategorySlugRecord {
  nextSlug: string;
}

export interface CategorySlugConflict {
  slug: string;
  records: Pick<CategorySlugRecord, 'id' | 'name' | 'parentId'>[];
}

export class CategorySlugReconciliationError extends Error {
  constructor(
    message: string,
    readonly conflicts: CategorySlugConflict[],
  ) {
    super(message);
  }
}

export function buildCategorySlug(
  name: string,
  parentName?: string | null,
): string {
  return toSlug(parentName ? `${parentName}-${name}` : name);
}

export function buildCategorySlugReconciliationPlan(
  records: readonly CategorySlugRecord[],
): CategorySlugChange[] {
  const byId = new Map(records.map((record) => [record.id, record]));
  const candidates = new Map<string, CategorySlugRecord[]>();
  const changes: CategorySlugChange[] = [];

  for (const record of records) {
    const parent = record.parentId ? byId.get(record.parentId) : undefined;
    if (record.parentId && (!parent || parent.parentId !== null)) {
      throw new CategorySlugReconciliationError(
        `Category ${record.id} has an unresolved or non-root parent ${record.parentId}`,
        [],
      );
    }

    const nextSlug = buildCategorySlug(record.name, parent?.name);
    if (!nextSlug) {
      throw new CategorySlugReconciliationError(
        `Category ${record.id} (${record.name}) cannot produce a valid slug`,
        [{ slug: nextSlug, records: [record] }],
      );
    }

    const sameCandidate = candidates.get(nextSlug) ?? [];
    sameCandidate.push(record);
    candidates.set(nextSlug, sameCandidate);
    if (record.slug !== nextSlug) changes.push({ ...record, nextSlug });
  }

  const conflicts = [...candidates.entries()]
    .filter(([, conflictingRecords]) => conflictingRecords.length > 1)
    .map(([slug, conflictingRecords]) => ({
      slug,
      records: conflictingRecords.map(({ id, name, parentId }) => ({
        id,
        name,
        parentId,
      })),
    }));
  if (conflicts.length > 0) {
    throw new CategorySlugReconciliationError(
      `Found ${conflicts.length} category slug conflict(s)`,
      conflicts,
    );
  }

  return changes.sort((left, right) => {
    const levelDifference =
      Number(left.parentId !== null) - Number(right.parentId !== null);
    return levelDifference || left.id.localeCompare(right.id);
  });
}
