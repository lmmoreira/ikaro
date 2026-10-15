import { beforeEach, describe, expect, it, vi } from 'vitest';

const bffServerFetch = vi.hoisted(() => vi.fn());

vi.mock('server-only', () => ({}));
vi.mock('@/shared/lib/api/bff-server', () => ({ bffServerFetch }));

import {
  fetchOpenSchedulingExceptions,
  findOpenSchedulingException,
} from './scheduling-exceptions.server';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

const items = [{ id: 'exc-1' }, { id: 'exc-2' }];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchOpenSchedulingExceptions', () => {
  it('reads the OPEN worklist from the BFF with the caller’s token', async () => {
    bffServerFetch.mockResolvedValue(jsonResponse({ items }));

    const result = await fetchOpenSchedulingExceptions('token-1');

    expect(bffServerFetch).toHaveBeenCalledWith('token-1', '/scheduling-exceptions?status=OPEN');
    expect(result).toEqual({ items });
  });

  it('throws when the BFF answers with an error', async () => {
    bffServerFetch.mockResolvedValue(jsonResponse({}, false, 500));

    await expect(fetchOpenSchedulingExceptions('token-1')).rejects.toThrow(
      'Failed to fetch scheduling exceptions (500)',
    );
  });
});

describe('findOpenSchedulingException', () => {
  it('returns the open entry with that id', async () => {
    bffServerFetch.mockResolvedValue(jsonResponse({ items }));

    await expect(findOpenSchedulingException('token-1', 'exc-2')).resolves.toEqual({ id: 'exc-2' });
  });

  it('returns null for an id that is not (or no longer) open', async () => {
    bffServerFetch.mockResolvedValue(jsonResponse({ items }));

    await expect(findOpenSchedulingException('token-1', 'exc-9')).resolves.toBeNull();
  });
});
