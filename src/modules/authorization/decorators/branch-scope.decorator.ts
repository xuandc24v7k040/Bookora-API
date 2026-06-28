import { SetMetadata } from '@nestjs/common';
import { AUTHORIZATION_METADATA_KEYS } from '../authorization.constants';
import { BranchScopeMode } from '../types/branch-context.type';

export const BranchScope = (
  mode: BranchScopeMode,
): MethodDecorator & ClassDecorator =>
  SetMetadata(AUTHORIZATION_METADATA_KEYS.branchScope, mode);
