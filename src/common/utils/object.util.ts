export function removeUndefinedProperties<T extends Record<string, unknown>>(
  value: T,
): Partial<T> {
  return Object.entries(value).reduce<Partial<T>>((result, [key, item]) => {
    if (item !== undefined) {
      result[key as keyof T] = item as T[keyof T];
    }

    return result;
  }, {});
}
