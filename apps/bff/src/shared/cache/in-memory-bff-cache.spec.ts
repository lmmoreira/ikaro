import { InMemoryBffCache } from './in-memory-bff-cache';

class FakeClock {
  private current = 1_000;
  now(): number {
    return this.current;
  }
  advance(ms: number): void {
    this.current += ms;
  }
}

describe('InMemoryBffCache', () => {
  it('stores a value until its own TTL passes', async () => {
    const clock = new FakeClock();
    const cache = new InMemoryBffCache<string>({ maxEntries: 5, clock });

    await cache.set('a', 'x', 1_000);
    expect(await cache.get('a')).toBe('x');

    clock.advance(1_000);
    expect(await cache.get('a')).toBeUndefined();
  });

  it('returns undefined for a key it never held', async () => {
    const cache = new InMemoryBffCache<string>({ maxEntries: 5 });

    expect(await cache.get('missing')).toBeUndefined();
  });

  it('forgets a deleted key', async () => {
    const cache = new InMemoryBffCache<string>({ maxEntries: 5 });
    await cache.set('a', 'x', 60_000);

    await cache.delete('a');

    expect(await cache.get('a')).toBeUndefined();
  });

  it('evicts the oldest entry once full', async () => {
    const cache = new InMemoryBffCache<number>({ maxEntries: 2 });
    await cache.set('a', 1, 60_000);
    await cache.set('b', 2, 60_000);
    await cache.set('c', 3, 60_000);

    expect(await cache.get('a')).toBeUndefined();
    expect(await cache.get('c')).toBe(3);
  });

  it('empties on clear', async () => {
    const cache = new InMemoryBffCache<string>({ maxEntries: 5 });
    await cache.set('a', 'x', 60_000);

    cache.clear();

    expect(await cache.get('a')).toBeUndefined();
  });
});
