import { type PaginationMeta } from './pagination.type';

export interface ApiResponse<T> {
  statusCode: number;
  message: string;
  data: T;
  meta?: Record<string, unknown> | PaginationMeta;
}

export interface ApiResponsePayload<T> {
  message?: string;
  data?: T;
  result?: T;
  meta?: Record<string, unknown> | PaginationMeta;
}
