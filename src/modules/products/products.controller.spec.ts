import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAccessGuard } from '@/modules/auth/guards/jwt-access.guard';
import { CsrfGuard } from '@/modules/auth/guards/csrf.guard';
import {
  AUTHORIZATION_METADATA_KEYS,
  PermissionsGuard,
} from '@/modules/authorization';
import { ProductsController } from './products.controller';

describe('ProductsController contract', () => {
  it('protects every route with authentication and permission guards', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      ProductsController,
    ) as unknown[];
    expect(guards).toEqual(
      expect.arrayContaining([JwtAccessGuard, PermissionsGuard]),
    );
  });

  it.each([
    ['list', 'products.read'],
    ['get', 'products.read'],
    ['create', 'products.create'],
    ['update', 'products.update'],
    ['remove', 'products.delete'],
    ['updateStatus', 'products.publish'],
    ['createOption', 'products.update'],
    ['createOptionValue', 'products.update'],
    ['bulkCreateVariants', 'products.update'],
    ['setDefaultVariant', 'products.update'],
  ])('maps %s to %s', (method, permission) => {
    const handler = ProductsController.prototype[
      method as keyof ProductsController
    ] as (...args: unknown[]) => unknown;
    expect(
      Reflect.getMetadata(AUTHORIZATION_METADATA_KEYS.permissions, handler),
    ).toEqual([permission]);
  });

  it.each([
    'create',
    'update',
    'remove',
    'updateStatus',
    'createOption',
    'createOptionValue',
    'createVariant',
    'bulkCreateVariants',
    'setDefaultVariant',
  ])('requires CSRF for mutation %s', (method) => {
    const handler = ProductsController.prototype[
      method as keyof ProductsController
    ] as (...args: unknown[]) => unknown;
    const guards = Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[];
    expect(guards).toContain(CsrfGuard);
  });
});
