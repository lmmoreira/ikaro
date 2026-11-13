import { TtlCache } from './ttl-cache';

class FakeClock {
  private current = 1_000_000;
  now(): number {
    return this.current;
  }
  advance(ms: number): void {
    this.current += ms;
  }
}

describe('TtlCache', () => {
  it('serves an entry until its own TTL elapses (300 s operational, 10 s suspended)', () => {
    const clock = new FakeClock();
    const cache = new TtlCache<string>({ maxEntries: 10, clock });
    cache.set('operational', 'a', 300_000);
    cache.set('suspended', 'b', 10_000);

    clock.advance(9_999);
    expect(cache.get('suspended')).toBe('b');
    clock.advance(1);
    expect(cache.get('suspended')).toBeUndefined();

    clock.advance(289_999);
    expect(cache.get('operational')).toBe('a');
    clock.advance(1);
    expect(cache.get('operational')).toBeUndefined();
  });

  it('never exceeds its maximum size and evicts the oldest entry first', () => {
    const cache = new TtlCache<number>({ maxEntries: 3, clock: new FakeClock() });
    for (let i = 0; i < 10; i += 1) cache.set(`k${i}`, i, 60_000);

    expect(cache.size).toBe(3);
    expect(cache.get('k6')).toBeUndefined();
    expect(cache.get('k7')).toBe(7);
    expect(cache.get('k9')).toBe(9);
  });

  it('moves an overwritten key to the newest position instead of evicting a fresh entry', () => {
    const cache = new TtlCache<number>({ maxEntries: 2, clock: new FakeClock() });
    cache.set('a', 1, 60_000);
    cache.set('b', 2, 60_000);
    cache.set('a', 3, 60_000);
    cache.set('c', 4, 60_000);

    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(3);
    expect(cache.get('c')).toBe(4);
  });

  it('forgets an expired entry on read so it stops counting toward the size', () => {
    const clock = new FakeClock();
    const cache = new TtlCache<string>({ maxEntries: 5, clock });
    cache.set('a', 'x', 1_000);
    clock.advance(1_000);

    expect(cache.get('a')).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('deletes and clears', () => {
    const cache = new TtlCache<string>({ maxEntries: 5, clock: new FakeClock() });
    cache.set('a', 'x', 1_000);
    cache.set('b', 'y', 1_000);
    cache.delete('a');
    expect(cache.get('a')).toBeUndefined();
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('rejects a maxEntries that cannot hold an entry', () => {
    expect(() => new TtlCache({ maxEntries: 0 })).toThrow('maxEntries');
  });

  it('uses the system clock when none is injected', () => {
    const cache = new TtlCache<string>({ maxEntries: 1 });
    cache.set('a', 'x', 60_000);
    expect(cache.get('a')).toBe('x');
  });
});
