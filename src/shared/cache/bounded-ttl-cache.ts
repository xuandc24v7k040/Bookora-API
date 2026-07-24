interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

export class BoundedTtlCache<T> {
  private readonly values = new Map<string, CacheEntry<T>>();
  private readonly inFlight = new Map<string, Promise<T>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
  ) {}

  get(key: string, loader: () => Promise<T>): Promise<T> {
    const cached = this.values.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      this.values.delete(key);
      this.values.set(key, cached);
      return Promise.resolve(cached.value);
    }
    if (cached) this.values.delete(key);

    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const request = loader()
      .then((value) => {
        this.values.set(key, {
          value,
          expiresAt: Date.now() + this.ttlMs,
        });
        this.evictOverflow();
        return value;
      })
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, request);
    return request;
  }

  clear(key: string): void {
    this.values.delete(key);
  }

  private evictOverflow(): void {
    while (this.values.size > this.maxEntries) {
      const oldestKey = this.values.keys().next().value;
      if (oldestKey === undefined) return;
      this.values.delete(oldestKey);
    }
  }
}
