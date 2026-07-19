import { SetMetadata } from '@nestjs/common';

export const SUPER_ADMIN_ONLY_METADATA_KEY =
  'bookora:authorization:super-admin-only';

export const SuperAdminOnly = () =>
  SetMetadata(SUPER_ADMIN_ONLY_METADATA_KEY, true);
