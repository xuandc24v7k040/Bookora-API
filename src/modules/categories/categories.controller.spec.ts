import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CsrfGuard } from '../auth/guards/csrf.guard';
import {
  AUTHORIZATION_METADATA_KEYS,
  PermissionsGuard,
} from '../authorization';
import { CategoriesController } from './categories.controller';

describe('CategoriesController authorization', () => {
  it('requires authentication, CSRF and permissions at controller level', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      CategoriesController,
    ) as unknown[];
    expect(guards).toEqual(
      expect.arrayContaining([JwtAccessGuard, CsrfGuard, PermissionsGuard]),
    );
  });

  it.each([
    ['tree', 'categories.read'],
    ['get', 'categories.read'],
    ['create', 'categories.create'],
    ['update', 'categories.update'],
    ['uploadImage', 'categories.update'],
    ['removeImage', 'categories.update'],
    ['remove', 'categories.delete'],
  ] as const)('requires %s permission mapping', (method, permission) => {
    const handler = CategoriesController.prototype[method];
    expect(
      Reflect.getMetadata(AUTHORIZATION_METADATA_KEYS.permissions, handler),
    ).toEqual([permission]);
  });
});
