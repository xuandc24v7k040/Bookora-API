import { SetMetadata } from '@nestjs/common';
import { AUTHORIZATION_METADATA_KEYS } from '../authorization.constants';

export const AnyPermissions = (
  ...permissions: string[]
): MethodDecorator & ClassDecorator =>
  SetMetadata(AUTHORIZATION_METADATA_KEYS.anyPermissions, permissions);
