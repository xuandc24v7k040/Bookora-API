import { SortDirection } from '../enums';
import type { PaginationMeta, PaginationOptions } from '../types';

interface PaginationInput {
  page?: number;
  limit?: number;
}

export function getPrismaSortOrder(
  sortDirection?: SortDirection,
): 'asc' | 'desc' {
  return sortDirection === SortDirection.ASC ? 'asc' : 'desc';
}

export function getPaginationOptions(
  paginationDto: PaginationInput,
): PaginationOptions {
  const page = paginationDto.page ?? 1;
  const limit = paginationDto.limit ?? 10;

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
}

export function buildPaginationMeta(
  total: number,
  page: number,
  limit: number,
): PaginationMeta {
  const lastPage = Math.max(Math.ceil(total / limit), 1);

  return {
    total,
    page,
    lastPage,
    limit,
    hasNextPage: page < lastPage,
    hasPreviousPage: page > 1,
  };
}
