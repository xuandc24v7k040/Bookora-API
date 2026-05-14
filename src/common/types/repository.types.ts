import {
  type ProjectionType,
  type QueryFilter,
  type QueryOptions,
  type SortOrder,
} from 'mongoose';

export type RepositoryFilter<T> = QueryFilter<T>;

export type RepositoryProjection<T> = ProjectionType<T>;

export type RepositoryOptions<T> = QueryOptions<T>;

export type RepositorySort<T> = Partial<
  Record<Extract<keyof T, string>, SortOrder>
>;
