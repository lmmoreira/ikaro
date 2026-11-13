import type { BffCache } from './bff-cache.port';
import { TtlCache, type TtlCacheOptions } from './ttl-cache';

/**
 * The in-process adapter of `BffCache` (M25-S16): `TtlCache`'s bounded, per-entry-TTL storage behind
 * the async port. Per instance by design, so the TTL is the staleness bound. A Redis adapter would
 * replace this class at its provider and nowhere else.
 */
export class InMemoryBffCache<V> implements BffCache<V> {
  private readonly store: TtlCache<V>;

  constructor(options: TtlCacheOptions) {
    this.store = new TtlCache<V>(options);
  }

  get(key: string): Promise<V | undefined> {
    return Promise.resolve(this.store.get(key));
  }

  set(key: string, value: V, ttlMs: number): Promise<void> {
    this.store.set(key, value, ttlMs);
    return Promise.resolve();
  }

  delete(key: string): Promise<void> {
    this.store.delete(key);
    return Promise.resolve();
  }

  /** Test seam: a real adapter (Redis) would never expose a wholesale flush. */
  clear(): void {
    this.store.clear();
  }
}
