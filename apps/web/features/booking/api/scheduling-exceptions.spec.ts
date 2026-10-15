import MockAdapter from 'axios-mock-adapter';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bffClient } from '@/shared/lib/api/bff-client';
import {
  countOpenSchedulingExceptions,
  listOpenSchedulingExceptions,
  resolveSchedulingExceptions,
} from './scheduling-exceptions';

const mock = new MockAdapter(bffClient);

beforeEach(() => mock.reset());
afterEach(() => mock.reset());

describe('listOpenSchedulingExceptions', () => {
  it('calls GET /scheduling-exceptions for the OPEN entries', async () => {
    mock.onGet('/scheduling-exceptions', { params: { status: 'OPEN' } }).reply(200, { items: [] });

    const result = await listOpenSchedulingExceptions();

    expect(result).toEqual({ items: [] });
    expect(mock.history.get[0].params).toEqual({ status: 'OPEN' });
  });
});

describe('countOpenSchedulingExceptions', () => {
  it('calls the count route (never the list) and returns the number', async () => {
    mock.onGet('/scheduling-exceptions/count').reply(200, { count: 4 });

    await expect(countOpenSchedulingExceptions()).resolves.toBe(4);
    expect(mock.history.get).toHaveLength(1);
    expect(mock.history.get[0].url).toBe('/scheduling-exceptions/count');
  });
});

describe('resolveSchedulingExceptions', () => {
  it('posts the whole request body and returns the per-entry results', async () => {
    const body = {
      exceptionIds: ['exc-1', 'exc-2'],
      resolutionType: 'REASSIGN' as const,
      target: { mode: 'AUTO' as const },
    };
    mock.onPost('/scheduling-exceptions/resolve').reply(200, {
      results: [
        { exceptionId: 'exc-1', outcome: 'RESOLVED' },
        {
          exceptionId: 'exc-2',
          outcome: 'STILL_OPEN',
          errorCode: 'BOOKING_EXCEPTION_REASSIGN_TARGET_INVALID',
        },
      ],
    });

    const result = await resolveSchedulingExceptions(body);

    expect(JSON.parse(mock.history.post[0].data)).toEqual(body);
    expect(result.results).toHaveLength(2);
    expect(result.results[1].outcome).toBe('STILL_OPEN');
  });
});
