import { describe, expect, it, vi } from 'vitest';
import type { ResolveSchedulingExceptionsRequest } from '@ikaro/types';
import { RESOLVE_BATCH_SIZE, resolveInBatches } from './resolve-in-batches';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `exc-${i + 1}`);
const request = (n: number): ResolveSchedulingExceptionsRequest => ({
  exceptionIds: ids(n),
  resolutionType: 'CANCEL',
  reason: 'closing down',
});

// A sender that resolves every id it receives.
const resolvingSender = () =>
  vi.fn(async (body: ResolveSchedulingExceptionsRequest) => ({
    results: body.exceptionIds.map((exceptionId) => ({
      exceptionId,
      outcome: 'RESOLVED' as const,
    })),
  }));

describe('resolveInBatches', () => {
  it('sends a selection within the cap as one request', async () => {
    const send = resolvingSender();

    const result = await resolveInBatches(request(3), send);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(request(3));
    expect(result.notProcessed).toEqual([]);
    expect(result.results.map((r) => r.exceptionId)).toEqual(ids(3));
  });

  it('a single id is one call', async () => {
    const send = resolvingSender();

    await resolveInBatches(request(1), send);

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('splits 250 ids into sequential batches of 100 / 100 / 50 and merges the results in order', async () => {
    const calls: number[] = [];
    let inFlight = 0;
    const send = vi.fn(async (body: ResolveSchedulingExceptionsRequest) => {
      inFlight += 1;
      expect(inFlight).toBe(1); // sequential: never two requests at once
      calls.push(body.exceptionIds.length);
      await Promise.resolve();
      inFlight -= 1;
      return {
        results: body.exceptionIds.map((exceptionId) => ({
          exceptionId,
          outcome: 'RESOLVED' as const,
        })),
      };
    });

    const result = await resolveInBatches(request(250), send);

    expect(RESOLVE_BATCH_SIZE).toBe(100);
    expect(calls).toEqual([100, 100, 50]);
    expect(result.results.map((r) => r.exceptionId)).toEqual(ids(250));
    expect(result.notProcessed).toEqual([]);
  });

  it('keeps the earlier batches’ results and reports the unsent ids when a later batch fails as a whole', async () => {
    const send = vi
      .fn<(body: ResolveSchedulingExceptionsRequest) => Promise<{ results: never[] }>>()
      .mockImplementationOnce(async (body) => ({
        results: body.exceptionIds.map((exceptionId) => ({
          exceptionId,
          outcome: 'RESOLVED' as const,
        })) as never[],
      }))
      .mockRejectedValueOnce(new Error('network down'));

    const result = await resolveInBatches(request(250), send);

    expect(send).toHaveBeenCalledTimes(2); // the third batch is never attempted
    expect(result.results.map((r) => r.exceptionId)).toEqual(ids(100));
    expect(result.notProcessed).toEqual(ids(250).slice(100)); // the failed batch and the unsent one
  });

  it('rethrows when the very first batch fails: nothing changed', async () => {
    const send = vi.fn().mockRejectedValue(new Error('network down'));

    await expect(resolveInBatches(request(250), send)).rejects.toThrow('network down');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('passes the per-entry STILL_OPEN outcomes through untouched', async () => {
    const send = vi.fn().mockResolvedValue({
      results: [
        { exceptionId: 'exc-1', outcome: 'STILL_OPEN', errorCode: 'BOOKING_SLOT_UNAVAILABLE' },
      ],
    });

    const result = await resolveInBatches(request(1), send);

    expect(result.results).toEqual([
      { exceptionId: 'exc-1', outcome: 'STILL_OPEN', errorCode: 'BOOKING_SLOT_UNAVAILABLE' },
    ]);
  });
});
