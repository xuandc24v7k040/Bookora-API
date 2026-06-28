import type { Request } from 'express';
import type { AuthenticatedUser } from '../../auth/types/authenticated-user.type';
import type { BranchContext } from './branch-context.type';

export interface AuthorizationRequest extends Request {
  user?: AuthenticatedUser;
  branchContext?: BranchContext;
}
