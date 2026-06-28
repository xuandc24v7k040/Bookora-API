import { SetMetadata } from '@nestjs/common';
import { AUTHORIZATION_METADATA_KEYS } from '../authorization.constants';

export const Permissions = (
  ...permissions: string[]
): MethodDecorator & ClassDecorator =>
  SetMetadata(AUTHORIZATION_METADATA_KEYS.permissions, permissions);
