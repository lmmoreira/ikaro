import type { BffCache } from '../cache/bff-cache.port';

/** The injection token of the one cache every backend caller shares (`BackendCacheModule`). */
export const BACKEND_RESPONSE_CACHE = Symbol('BackendResponseCache');

/**
 * A call opts into caching by passing this; a call without it is never cached.
 *
 * `key` is required and is a **tenant-isolation boundary**: the cache is shared by every caller, so
 * a response that varies by tenant or actor must carry the tenant or actor in its key. Only
 * tenant-independent reads (a slug → tenant lookup, a tenant's own access answer keyed by its id)
 * use a plain key. Namespace the key (`tenant-by-slug:<slug>`) so two reads never collide.
 *
 * `ttlMs` is a number, or a function of the response for an answer whose lifetime depends on its
 * content; returning `undefined` means "do not cache this one" (a fail-open answer must not be pinned).
 */
export interface BackendCacheOption<T> {
  readonly key: string;
  readonly ttlMs: number | ((body: T) => number | undefined);
}

export interface BackendReadOptions<T> {
  readonly cache?: BackendCacheOption<T>;
}

/**
 * Returns the cached body for `option.key`, or loads it, stores it under the TTL and returns it.
 * With no option it just loads. A failed load throws and is never stored, so an unknown slug or an
 * outage is retried on the next call.
 */
export async function readThrough<T>(
  store: BffCache<unknown>,
  option: BackendCacheOption<T> | undefined,
  load: () => Promise<T>,
): Promise<T> {
  if (!option) return load();

  const hit = await store.get(option.key);
  if (hit !== undefined) return hit as T;

  const body = await load();
  const ttlMs = typeof option.ttlMs === 'function' ? option.ttlMs(body) : option.ttlMs;
  if (ttlMs !== undefined && ttlMs > 0) await store.set(option.key, body, ttlMs);
  return body;
}
