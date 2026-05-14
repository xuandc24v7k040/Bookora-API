export interface PaginationOptions {
  page: number;
  limit: number;
  skip: number;
}

export interface PaginationMeta {
  total: number;
  page: number;
  lastPage: number;
  limit: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface Paginated<T> {
  data: T[];
  meta: PaginationMeta;
}
