import { mapConcurrentlyIsolated } from './concurrent-isolated';

const options = (failures: number[] = []) => ({
  onFailure: (item: number) => {
    failures.push(item);
  },
  summarize: (failed: readonly number[]) => `${failed.length} failed`,
});

describe('mapConcurrentlyIsolated', () => {
  it('returns the results in input order', async () => {
    const results = await mapConcurrentlyIsolated(
      [1, 2, 3, 4, 5],
      2,
      async (n) => n * 10,
      options(),
    );

    expect(results).toEqual([10, 20, 30, 40, 50]);
  });

  it('never has more than `concurrency` units in flight and runs a chunk at the same time', async () => {
    let inFlight = 0;
    let peak = 0;
    await mapConcurrentlyIsolated(
      [1, 2, 3, 4, 5, 6, 7],
      3,
      async (n) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setImmediate(resolve));
        inFlight -= 1;
        return n;
      },
      options(),
    );

    expect(peak).toBe(3);
  });

  it('tries every item when one fails, reports each failure and throws once at the end', async () => {
    const failures: number[] = [];
    const seen: number[] = [];

    await expect(
      mapConcurrentlyIsolated(
        [1, 2, 3, 4],
        2,
        async (n) => {
          seen.push(n);
          if (n % 2 === 0) throw new Error(`boom ${n}`);
          return n;
        },
        options(failures),
      ),
    ).rejects.toThrow('2 failed');

    expect(seen.sort()).toEqual([1, 2, 3, 4]);
    expect(failures.sort()).toEqual([2, 4]);
  });

  it('does nothing for an empty list', async () => {
    await expect(
      mapConcurrentlyIsolated([], 3, async (n: number) => n, options()),
    ).resolves.toEqual([]);
  });

  it.each([0, -1, 1.5])('rejects the concurrency %p', async (concurrency) => {
    await expect(
      mapConcurrentlyIsolated([1], concurrency, async (n) => n, options()),
    ).rejects.toThrow(RangeError);
  });
});
