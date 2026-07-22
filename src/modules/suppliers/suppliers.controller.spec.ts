import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAccessGuard } from '@/modules/auth/guards/jwt-access.guard';
import {
  AUTHORIZATION_METADATA_KEYS,
  BranchScopeGuard,
  BranchScopeMode,
  PermissionsGuard,
} from '@/modules/authorization';
import { SuppliersController } from './suppliers.controller';

describe('SuppliersController authorization contract', () => {
  it('resolves optional branch context for the global Supplier catalog', () => {
    expect(
      Reflect.getMetadata(
        AUTHORIZATION_METADATA_KEYS.branchScope,
        SuppliersController,
      ),
    ).toBe(BranchScopeMode.OPTIONAL_SELECTION);
    expect(Reflect.getMetadata(GUARDS_METADATA, SuppliersController)).toEqual(
      expect.arrayContaining([
        JwtAccessGuard,
        BranchScopeGuard,
        PermissionsGuard,
      ]),
    );
  });

  it('allows receipt capabilities to read options without granting Supplier CRUD', () => {
    const metadata = (
      method: keyof SuppliersController,
      key: 'permissions' | 'anyPermissions',
    ) =>
      Reflect.getMetadata(
        AUTHORIZATION_METADATA_KEYS[key],
        SuppliersController.prototype[method],
      );

    expect(metadata('list', 'anyPermissions')).toEqual([
      'suppliers.read',
      'stock_receipts.create',
      'stock_receipts.update',
    ]);
    expect(metadata('create', 'permissions')).toEqual(['suppliers.create']);
    expect(metadata('update', 'permissions')).toEqual(['suppliers.update']);
    expect(metadata('remove', 'permissions')).toEqual(['suppliers.delete']);
  });
});
