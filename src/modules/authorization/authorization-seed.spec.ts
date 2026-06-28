import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('authorization seed branch-admin permissions', () => {
  const source = readFileSync(
    join(process.cwd(), 'prisma/catalog.seed.ts'),
    'utf8',
  );
  const branchAdminBlock = source.slice(
    source.indexOf('BRANCH_ADMIN: ['),
    source.indexOf('STAFF: []'),
  );

  it('grants branch-scoped offboarding but not branch assignment', () => {
    expect(branchAdminBlock).toContain("'staff.delete'");
    expect(branchAdminBlock).not.toContain("'staff.assign_branch'");
  });
});
