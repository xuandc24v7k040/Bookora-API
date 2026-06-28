import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CsrfGuard } from '../auth/guards/csrf.guard';
import {
  AUTHORIZATION_METADATA_KEYS,
  PermissionsGuard,
} from '../authorization';
import { UsersController } from './users.controller';

describe('UsersController authentication', () => {
  it('requires JwtAccessGuard for every endpoint at controller level', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      UsersController,
    ) as unknown[];

    expect(guards).toContain(JwtAccessGuard);
    expect(guards).toContain(CsrfGuard);
    expect(guards).toContain(PermissionsGuard);
  });

  it.each([
    ['findAll', 'users.read'],
    ['findOne', 'users.read'],
    ['create', 'users.create'],
    ['update', 'users.update'],
    ['remove', 'users.delete'],
  ])('requires %s permission mapping', (method, permission) => {
    const handler = UsersController.prototype[
      method as keyof UsersController
    ] as (...args: unknown[]) => unknown;
    expect(
      Reflect.getMetadata(AUTHORIZATION_METADATA_KEYS.permissions, handler),
    ).toEqual([permission]);
  });
});
