import { BaseResponse } from '../types';

export function isBaseResponse(value: unknown): value is BaseResponse<unknown> {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const response = value as Record<string, unknown>;
  return (
    typeof response.success === 'boolean' &&
    typeof response.statusCode === 'number' &&
    typeof response.message === 'string' &&
    'data' in response
  );
}
