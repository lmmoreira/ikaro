export const CACHE_PORT = Symbol('CachePort');

export interface CachePort {
  get<T>(key: string): Promise<T | null | undefined>;
  set<T>(key: string, value: T, ttlMs?: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
}
