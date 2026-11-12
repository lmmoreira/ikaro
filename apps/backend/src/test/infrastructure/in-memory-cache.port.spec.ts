import { AdvanceableClock } from './advanceable-clock';
import { InMemoryCachePort } from './in-memory-cache.port';

describe('InMemoryCachePort TTL', () => {
  it('expires an entry once its ttl has elapsed on the injected clock', async () => {
    const clock = new AdvanceableClock(new Date('2026-11-12T12:00:00.000Z'));
    const cache = new InMemoryCachePort(clock);
    await cache.set('k', 'v', 1_000);

    clock.advanceMs(999);
    await expect(cache.get('k')).resolves.toBe('v');
    clock.advanceMs(1);
    await expect(cache.get('k')).resolves.toBeNull();
    expect(cache.has('k')).toBe(false);
  });

  it('never expires an entry set without a ttl', async () => {
    const clock = new AdvanceableClock();
    const cache = new InMemoryCachePort(clock);
    await cache.set('k', 'v');

    clock.advanceMs(365 * 24 * 60 * 60 * 1000);

    await expect(cache.get('k')).resolves.toBe('v');
  });
});
