import { mapSequentiallyIsolated } from './sequential-isolated';

describe('mapSequentiallyIsolated', () => {
  const summarize = (failed: readonly number[]): string => `failed: ${failed.join(', ')}`;

  it('returns the results in input order when every item succeeds', async () => {
    const onFailure = jest.fn();

    const results = await mapSequentiallyIsolated([1, 2, 3], async (n) => n * 10, {
      onFailure,
      summarize,
    });

    expect(results).toEqual([10, 20, 30]);
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('runs the items one after another', async () => {
    const order: string[] = [];

    await mapSequentiallyIsolated(
      [1, 2],
      async (n) => {
        order.push(`start ${n}`);
        await Promise.resolve();
        order.push(`end ${n}`);
      },
      { onFailure: jest.fn(), summarize },
    );

    expect(order).toEqual(['start 1', 'end 1', 'start 2', 'end 2']);
  });

  it('tries every item after a failure, then throws once naming the failed items', async () => {
    const seen: number[] = [];

    await expect(
      mapSequentiallyIsolated(
        [1, 2, 3, 4],
        async (n) => {
          seen.push(n);
          if (n % 2 === 0) throw new Error(`${n} broke`);
        },
        { onFailure: jest.fn(), summarize },
      ),
    ).rejects.toThrow('failed: 2, 4');

    expect(seen).toEqual([1, 2, 3, 4]);
  });

  it('reports each failure with its item and error, as it happens', async () => {
    const onFailure = jest.fn();
    const boom = new Error('boom');

    await expect(
      mapSequentiallyIsolated(
        [1, 2],
        async (n) => {
          if (n === 2) throw boom;
        },
        { onFailure, summarize },
      ),
    ).rejects.toThrow();

    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onFailure).toHaveBeenCalledWith(2, boom);
  });

  it('returns an empty list for no items without calling anything', async () => {
    const onFailure = jest.fn();

    await expect(
      mapSequentiallyIsolated([], async () => 1, { onFailure, summarize }),
    ).resolves.toEqual([]);
    expect(onFailure).not.toHaveBeenCalled();
  });
});
