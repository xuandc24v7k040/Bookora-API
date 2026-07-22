import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAccessGuard } from '@/modules/auth/guards/jwt-access.guard';
import {
  AUTHORIZATION_METADATA_KEYS,
  BranchScopeGuard,
  BranchScopeMode,
  PermissionsGuard,
} from '@/modules/authorization';
import { ProductMediaController } from './product-media.controller';

describe('ProductMediaController authorization contract', () => {
  it('resolves optional branch context before product read authorization', () => {
    expect(
      Reflect.getMetadata(
        AUTHORIZATION_METADATA_KEYS.branchScope,
        ProductMediaController,
      ),
    ).toBe(BranchScopeMode.OPTIONAL_SELECTION);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, ProductMediaController),
    ).toEqual(
      expect.arrayContaining([
        JwtAccessGuard,
        BranchScopeGuard,
        PermissionsGuard,
      ]),
    );
  });

  it('keeps gallery reads on products.read while mutations remain products.update', () => {
    const metadata = (method: keyof ProductMediaController) =>
      Reflect.getMetadata(
        AUTHORIZATION_METADATA_KEYS.permissions,
        ProductMediaController.prototype[method],
      );

    expect(metadata('list')).toEqual(['products.read']);
    expect(metadata('upload')).toEqual(['products.update']);
    expect(metadata('update')).toEqual(['products.update']);
    expect(metadata('remove')).toEqual(['products.update']);
  });
});
