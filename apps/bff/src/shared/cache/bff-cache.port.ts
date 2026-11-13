/**
 * The BFF's cache port (M25-S16). Async on purpose: the in-process `TtlCache` could answer
 * synchronously, but a Redis adapter cannot, and callers must not change when the adapter does.
 * A cache is best-effort: a miss is `undefined`, never an error the caller has to handle.
 */
export interface BffCache<V> {
  get(key: string): Promise<V | undefined>;
  set(key: string, value: V, ttlMs: number): Promise<void>;
  delete(key: string): Promise<void>;
}
