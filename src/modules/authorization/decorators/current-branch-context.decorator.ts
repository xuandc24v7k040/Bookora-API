import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthorizationRequest } from '../types/authorization-request.type';

export const CurrentBranchContext = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<AuthorizationRequest>().branchContext,
);
