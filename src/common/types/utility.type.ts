export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export type Maybe<T> = T | null | undefined;
export type StrictOmit<T, K extends keyof T> = Omit<T, K>;
export type StrictPick<T, K extends keyof T> = Pick<T, K>;

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};
