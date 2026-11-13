export interface CacheClock {
  now(): number;
}

const SYSTEM_CLOCK: CacheClock = { now: () => Date.now() };

export interface TtlCacheOptions {
  /** Hard ceiling on stored entries; the oldest is evicted first, so a flood of distinct keys cannot grow it. */
  maxEntries: number;
  /** Injectable so a spec can advance time without waiting. */
  clock?: CacheClock;
}

/**
 * A small, bounded, in-process TTL cache with a per-entry TTL (M25-S16). It is per instance by
 * design: there is no cross-instance invalidation, so the TTL is the staleness bound (the BFF has no
 * `CachePort` or cache module). Insertion order is the eviction order: a `set` on an existing key
 * moves it to the newest position.
 */
export class TtlCache<V> {
  private readonly entries = new Map<string, { value: V; expiresAt: number }>();
  private readonly clock: CacheClock;
  private readonly maxEntries: number;

  constructor(options: TtlCacheOptions) {
    if (!Number.isInteger(options.maxEntries) || options.maxEntries < 1) {
      throw new Error('TtlCache needs a maxEntries of at least 1');
    }
    this.maxEntries = options.maxEntries;
    this.clock = options.clock ?? SYSTEM_CLOCK;
  }

  get(key: string): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.clock.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: V, ttlMs: number): void {
    this.entries.delete(key);
    while (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
    this.entries.set(key, { value, expiresAt: this.clock.now() + ttlMs });
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}
