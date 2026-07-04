import { beforeEach, describe, expect, it, vi } from 'vitest';

const bffServerFetch = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), {
      digest: `NEXT_REDIRECT;replace;${url};307;`,
    });
  }),
);
const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw Object.assign(new Error('NEXT_NOT_FOUND'), { digest: 'NEXT_NOT_FOUND' });
  }),
);

vi.mock('@/shared/lib/api/bff-server', () => ({ bffServerFetch }));
vi.mock('next/navigation', () => ({ redirect, notFound }));

import {
  CustomerFetchError,
  fetchCustomerBookingDetailOrRedirect,
  fetchCustomerBookings,
  fetchLoyaltyBalance,
  fetchLoyaltyEntries,
  fetchLoyaltyRedemptions,
  withAuthRedirect,
} from './api.server';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

beforeEach(() => {
  bffServerFetch.mockReset();
  redirect.mockClear();
  notFound.mockClear();
});

describe('fetchCustomerBookings / fetchLoyaltyBalance / fetchLoyaltyEntries / fetchLoyaltyRedemptions', () => {
  it.each([
    ['fetchCustomerBookings', fetchCustomerBookings],
    ['fetchLoyaltyBalance', fetchLoyaltyBalance],
    ['fetchLoyaltyEntries', fetchLoyaltyEntries],
    ['fetchLoyaltyRedemptions', fetchLoyaltyRedemptions],
  ])('%s returns the parsed body on success', async (_name, fetcher) => {
    bffServerFetch.mockResolvedValue(jsonResponse({ items: [] }));
    await expect(fetcher('token')).resolves.toEqual({ items: [] });
  });

  it.each([
    ['fetchCustomerBookings', fetchCustomerBookings],
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
});

describe('withAuthRedirect', () => {
  it('resolves with the value on success', async () => {
    await expect(withAuthRedirect(Promise.resolve('ok'), 'lavacar-bh')).resolves.toBe('ok');
  });

  it.each([401, 403])('redirects to login on a %i CustomerFetchError', async (status) => {
    const rejected = Promise.reject(new CustomerFetchError(status, 'unauthorized'));
    await expect(withAuthRedirect(rejected, 'lavacar-bh')).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/lavacar-bh/login');
  });

  it('rethrows without redirecting for any other error', async () => {
    const rejected = Promise.reject(new CustomerFetchError(500, 'boom'));
    await expect(withAuthRedirect(rejected, 'lavacar-bh')).rejects.toThrow('boom');
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe('fetchCustomerBookingDetailOrRedirect', () => {
  it('returns the parsed booking on success', async () => {
    bffServerFetch.mockResolvedValue(jsonResponse({ bookingId: 'b1' }));
    await expect(
      fetchCustomerBookingDetailOrRedirect('token', 'b1', 'lavacar-bh'),
    ).resolves.toEqual({ bookingId: 'b1' });
  });

  it('calls notFound() on a 404', async () => {
    bffServerFetch.mockResolvedValue(jsonResponse(null, false, 404));
    await expect(fetchCustomerBookingDetailOrRedirect('token', 'b1', 'lavacar-bh')).rejects.toThrow(
      'NEXT_NOT_FOUND',
    );
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403])('redirects to login on a %i', async (status) => {
    bffServerFetch.mockResolvedValue(jsonResponse(null, false, status));
    await expect(fetchCustomerBookingDetailOrRedirect('token', 'b1', 'lavacar-bh')).rejects.toThrow(
      'NEXT_REDIRECT',
    );
    expect(redirect).toHaveBeenCalledWith('/lavacar-bh/login');
  });

  it('rethrows the original error for a 500', async () => {
    bffServerFetch.mockResolvedValue(jsonResponse(null, false, 500));
    await expect(
      fetchCustomerBookingDetailOrRedirect('token', 'b1', 'lavacar-bh'),
    ).rejects.toMatchObject({ status: 500 });
    expect(notFound).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});
