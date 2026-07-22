import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAccessGuard } from '@/modules/auth/guards/jwt-access.guard';
import { CsrfGuard } from '@/modules/auth/guards/csrf.guard';
import {
  AUTHORIZATION_METADATA_KEYS,
  BranchScopeGuard,
  BranchScopeMode,
  PermissionsGuard,
} from '@/modules/authorization';
import { InventoryController } from './inventory.controller';

describe('InventoryController contract', () => {
  it('protects routes with authentication, branch and permission guards', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      InventoryController,
    ) as unknown[];
    expect(guards).toEqual(
      expect.arrayContaining([
        JwtAccessGuard,
        BranchScopeGuard,
        PermissionsGuard,
      ]),
    );
  });

  it.each([
    ['stocks', 'inventory.read'],
    ['updateThreshold', 'inventory.update_threshold'],
  ])('maps %s to %s', (method, permission) => {
    const handler = InventoryController.prototype[
      method as keyof InventoryController
    ] as (...args: unknown[]) => unknown;
    expect(
      Reflect.getMetadata(AUTHORIZATION_METADATA_KEYS.permissions, handler),
    ).toEqual([permission]);
  });

  it('uses any-of authorization and branch context for the global selector', () => {
    const options = Object.getOwnPropertyDescriptor(
      InventoryController.prototype,
      'variantOptions',
    )?.value;
    expect(
      Reflect.getMetadata(AUTHORIZATION_METADATA_KEYS.anyPermissions, options),
    ).toEqual([
      'products.read',
      'stock_receipts.create',
      'stock_receipts.update',
    ]);
    expect(
      Reflect.getMetadata(AUTHORIZATION_METADATA_KEYS.branchScope, options),
    ).toBe(BranchScopeMode.OPTIONAL_SELECTION);
  });

  it('keeps stocks branch scoped', () => {
    const stocks = Object.getOwnPropertyDescriptor(
      InventoryController.prototype,
      'stocks',
    )?.value;
    expect(
      Reflect.getMetadata(AUTHORIZATION_METADATA_KEYS.branchScope, stocks),
    ).toBe(BranchScopeMode.REQUIRED_SELECTION);
  });

  it('requires CSRF for threshold mutation', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      Object.getOwnPropertyDescriptor(
        InventoryController.prototype,
        'updateThreshold',
      )?.value,
    ) as unknown[];
    expect(guards).toContain(CsrfGuard);
  });
});
