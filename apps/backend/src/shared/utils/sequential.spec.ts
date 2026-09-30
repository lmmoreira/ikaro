import { mapSequentially } from './sequential';

describe('mapSequentially', () => {
  it('returns the results in input order', async () => {
    const results = await mapSequentially([1, 2, 3], (n) => Promise.resolve(n * 10));

    expect(results).toEqual([10, 20, 30]);
  });

  it('never starts an item before the previous one has finished', async () => {
    const events: string[] = [];
    const work = async (name: string, delayMs: number): Promise<string> => {
      events.push(`start ${name}`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      events.push(`end ${name}`);
      return name;
    };

    await mapSequentially(
      [
        ['a', 30],
        ['b', 1],
        ['c', 10],
      ] as const,
      ([name, delay]) => work(name, delay),
    );

    expect(events).toEqual(['start a', 'end a', 'start b', 'end b', 'start c', 'end c']);
  });

  it('passes the item index', async () => {
    const indexes = await mapSequentially(['x', 'y'], (_item, index) => Promise.resolve(index));

    expect(indexes).toEqual([0, 1]);
  });

  it('resolves to an empty list for no items without calling the work', async () => {
    const work = jest.fn();

    await expect(mapSequentially([], work)).resolves.toEqual([]);
    expect(work).not.toHaveBeenCalled();
  });

  it('stops at the first failure and does not run the remaining items', async () => {
    const seen: number[] = [];

    await expect(
      mapSequentially([1, 2, 3], (n) => {
        seen.push(n);
        return n === 2 ? Promise.reject(new Error('boom')) : Promise.resolve(n);
      }),
    ).rejects.toThrow('boom');

    expect(seen).toEqual([1, 2]);
  });
});
