import { CachePort } from '../../shared/ports/cache.port';

// Sentinel wrapper so `undefined`/`null` can themselves be injected as the rejection value —
// "no pending failure" is tracked by field presence (`| typeof NONE`), not by the value's own
// truthiness.
const NONE = Symbol('no pending cache failure');

// Configurable failure injection (failNextGet/Set/Del) — the one thing a plain in-memory Map
// can't exercise on its own — lets specs cover a CachingXxxRepository's best-effort try/catch
// fallback paths without reaching for jest.fn() (docs/ENGINEERING_RULES.md § InMemory doubles).
// Accepts any rejection value, not just Error instances, matching what a real cache backend
// (a driver throwing a raw string/plain object) can actually reject with.
export class InMemoryCachePort implements CachePort {
  private readonly store = new Map<string, unknown>();
  private nextGetError: unknown = NONE;
  private nextSetError: unknown = NONE;
  private nextDelError: unknown = NONE;
  // Recorded regardless of failure injection — state-based replacement for a jest.fn()
  // `.mock.calls`/`toHaveBeenCalledWith` assertion on a cache call.
  readonly getCalls: string[] = [];
  readonly setCalls: Array<{ key: string; value: unknown }> = [];
  readonly delCalls: string[] = [];

  async get<T>(key: string): Promise<T | null> {
    this.getCalls.push(key);
    if (this.nextGetError !== NONE) {
      const err = this.nextGetError;
      this.nextGetError = NONE;
      throw err;
    }
    return (this.store.get(key) as T | undefined) ?? null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.setCalls.push({ key, value });
    if (this.nextSetError !== NONE) {
      const err = this.nextSetError;
      this.nextSetError = NONE;
      throw err;
    }
    this.store.set(key, value);
  }

  async del(key: string): Promise<void> {
    this.delCalls.push(key);
    if (this.nextDelError !== NONE) {
      const err = this.nextDelError;
      this.nextDelError = NONE;
      throw err;
    }
    this.store.delete(key);
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  failNextGet(error: unknown): void {
    this.nextGetError = error;
  }

  failNextSet(error: unknown): void {
    this.nextSetError = error;
  }

  failNextDel(error: unknown): void {
    this.nextDelError = error;
  }
}
