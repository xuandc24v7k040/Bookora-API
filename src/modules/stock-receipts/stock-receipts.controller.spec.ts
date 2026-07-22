import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAccessGuard } from '@/modules/auth/guards/jwt-access.guard';
import { CsrfGuard } from '@/modules/auth/guards/csrf.guard';
import {
  AUTHORIZATION_METADATA_KEYS,
  BranchScopeGuard,
  BranchScopeMode,
  PermissionsGuard,
} from '@/modules/authorization';
import { StockReceiptsController } from './stock-receipts.controller';

describe('StockReceiptsController contract', () => {
  it('requires selected branch and authorization guards', () => {
    expect(
      Reflect.getMetadata(
        AUTHORIZATION_METADATA_KEYS.branchScope,
        StockReceiptsController,
      ),
    ).toBe(BranchScopeMode.REQUIRED_SELECTION);
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      StockReceiptsController,
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
    ['list', 'stock_receipts.read'],
    ['get', 'stock_receipts.read'],
    ['create', 'stock_receipts.create'],
    ['update', 'stock_receipts.update'],
    ['cancel', 'stock_receipts.cancel'],
    ['confirm', 'stock_receipts.confirm'],
  ])('maps %s to %s', (method, permission) => {
    const handler = StockReceiptsController.prototype[
      method as keyof StockReceiptsController
    ] as (...args: unknown[]) => unknown;
    expect(
      Reflect.getMetadata(AUTHORIZATION_METADATA_KEYS.permissions, handler),
    ).toEqual([permission]);
  });

  it.each(['create', 'update', 'cancel', 'confirm'])(
    'requires CSRF for mutation %s',
    (method) => {
      const handler = StockReceiptsController.prototype[
        method as keyof StockReceiptsController
      ] as (...args: unknown[]) => unknown;
      const guards = Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[];
      expect(guards).toContain(CsrfGuard);
    },
  );
});
