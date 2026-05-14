import { buildPaginationMeta } from '../utils/pagination.util';
import type { Paginated, PaginationMeta } from '../types';

export class PaginatedResponseDto<T> implements Paginated<T> {
  data: T[];
  meta: PaginationMeta;

  constructor(data: T[], total: number, page: number, limit: number) {
    this.data = data;
    this.meta = buildPaginationMeta(total, page, limit);
  }
}
