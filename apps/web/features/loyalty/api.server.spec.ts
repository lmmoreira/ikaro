import { beforeEach, describe, expect, it, vi } from 'vitest';

const bffServerFetch = vi.hoisted(() => vi.fn());

vi.mock('@/shared/lib/api/bff-server', () => ({ bffServerFetch }));

import { CustomerFetchError } from '@/shared/lib/api/errors';
import { fetchLoyaltyBalance, fetchLoyaltyEntries, fetchLoyaltyRedemptions } from './api.server';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

beforeEach(() => {
  bffServerFetch.mockReset();
});

describe('fetchLoyaltyBalance / fetchLoyaltyEntries / fetchLoyaltyRedemptions', () => {
  it.each([
    ['fetchLoyaltyBalance', fetchLoyaltyBalance, '/loyalty/balance'],
    ['fetchLoyaltyEntries', fetchLoyaltyEntries, '/loyalty/entries?limit=50'],
    ['fetchLoyaltyRedemptions', fetchLoyaltyRedemptions, '/loyalty/redemptions?limit=50'],
  ])('%s requests %s with the given token', async (_name, fetcher, expectedPath) => {
    bffServerFetch.mockResolvedValue(jsonResponse({ items: [] }));
    await fetcher('token');
    expect(bffServerFetch).toHaveBeenCalledWith('token', expectedPath);
  });

  it.each([
    ['fetchLoyaltyBalance', fetchLoyaltyBalance],
    ['fetchLoyaltyEntries', fetchLoyaltyEntries],
    ['fetchLoyaltyRedemptions', fetchLoyaltyRedemptions],
  ])('%s returns the parsed body on success', async (_name, fetcher) => {
    bffServerFetch.mockResolvedValue(jsonResponse({ items: [] }));
    await expect(fetcher('token')).resolves.toEqual({ items: [] });
  });

  it.each([
    ['fetchLoyaltyBalance', fetchLoyaltyBalance],
    ['fetchLoyaltyEntries', fetchLoyaltyEntries],
    ['fetchLoyaltyRedemptions', fetchLoyaltyRedemptions],
  ])(
    '%s throws a CustomerFetchError carrying the response status on failure',
    async (_name, fetcher) => {
      bffServerFetch.mockResolvedValue(jsonResponse(null, false, 401));
      let error: unknown;
      await fetcher('token').catch((err: unknown) => {
        error = err;
      });
      expect(error).toBeInstanceOf(CustomerFetchError);
      expect((error as CustomerFetchError).status).toBe(401);
    },
  );

  it('parses code/field from the response body instead of discarding it', async () => {
    bffServerFetch.mockResolvedValue(
      jsonResponse({ code: 'AUTH_UNAUTHORIZED', field: 'token' }, false, 401),
    );
    let error: unknown;
    await fetchLoyaltyBalance('token').catch((err: unknown) => {
      error = err;
    });
    expect(error).toMatchObject({ code: 'AUTH_UNAUTHORIZED', field: 'token' });
  });
});
