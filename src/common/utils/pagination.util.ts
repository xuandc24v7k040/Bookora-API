import { SortDirection } from '../enums';
import type { PaginationMeta, PaginationOptions } from '../types';

export type MongoSortOrder = 1 | -1;

interface PaginationInput {
  page?: number;
  limit?: number;
}

export function getMongoSortOrder(
  sortDirection?: SortDirection,
): MongoSortOrder {
  return sortDirection === SortDirection.ASC ? 1 : -1;
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
