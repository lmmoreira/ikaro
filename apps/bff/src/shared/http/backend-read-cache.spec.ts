import { InMemoryBffCache } from '../cache/in-memory-bff-cache';
import { readThrough } from './backend-read-cache';

class FakeClock {
  private current = 1_000;
  now(): number {
    return this.current;
  }
  advance(ms: number): void {
    this.current += ms;
  }
}

function makeStore(clock = new FakeClock()) {
  return { store: new InMemoryBffCache<unknown>({ maxEntries: 10, clock }), clock };
}

describe('readThrough', () => {
  it('loads every time when the call declares no cache', async () => {
    const { store } = makeStore();
    const load = jest.fn().mockResolvedValue('body');

    await readThrough(store, undefined, load);
    await readThrough(store, undefined, load);

    expect(load).toHaveBeenCalledTimes(2);
  });

  it('loads once and serves the next call from the cache until the TTL passes', async () => {
    const { store, clock } = makeStore();
    const load = jest.fn().mockResolvedValue('body');
    const option = { key: 'k', ttlMs: 1_000 };

    await readThrough(store, option, load);
    await readThrough(store, option, load);
    expect(load).toHaveBeenCalledTimes(1);

    clock.advance(1_000);
    await readThrough(store, option, load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('takes the TTL from the response when it is a function', async () => {
    const { store, clock } = makeStore();
    const load = jest.fn().mockResolvedValueOnce({ operational: false });
    load.mockResolvedValue({ operational: true });
    const option = {
      key: 'k',
      ttlMs: (body: { operational: boolean }) => (body.operational ? 300_000 : 10_000),
    };

    await readThrough(store, option, load);
    clock.advance(9_999);
    await readThrough(store, option, load);
    expect(load).toHaveBeenCalledTimes(1);
    clock.advance(1);
    await readThrough(store, option, load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('does not store an answer whose TTL function returns undefined', async () => {
    const { store } = makeStore();
    const load = jest.fn().mockResolvedValue({ degraded: true });
    const option = { key: 'k', ttlMs: () => undefined };

    await readThrough(store, option, load);
    await readThrough(store, option, load);

    expect(load).toHaveBeenCalledTimes(2);
  });

  it('never stores a failed load', async () => {
    const { store } = makeStore();
    const load = jest.fn().mockRejectedValueOnce(new Error('404')).mockResolvedValue('body');
    const option = { key: 'k', ttlMs: 1_000 };

    await expect(readThrough(store, option, load)).rejects.toThrow('404');
    await expect(readThrough(store, option, load)).resolves.toBe('body');

    expect(load).toHaveBeenCalledTimes(2);
  });

  it('keeps two keys apart', async () => {
    const { store } = makeStore();
    const load = jest.fn().mockResolvedValueOnce('a').mockResolvedValueOnce('b');

    await readThrough(store, { key: 'tenant-by-slug:x', ttlMs: 1_000 }, load);
    const other = await readThrough(store, { key: 'tenant-access:x', ttlMs: 1_000 }, load);

    expect(other).toBe('b');
  });
});
