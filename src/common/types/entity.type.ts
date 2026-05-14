export interface EntityId {
  _id: string;
}

export interface TimestampedEntity {
  createdAt: Date;
  updatedAt: Date;
}

export type Entity<T> = T & EntityId;
export type Timestamped<T> = T & TimestampedEntity;
export type TimestampedEntityModel<T> = Entity<Timestamped<T>>;
