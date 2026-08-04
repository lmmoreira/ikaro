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

import { CustomerFetchError } from '@/features/customer/api.server';
import { fetchCustomerBookingDetailOrRedirect, fetchCustomerBookings } from './customer.server';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

beforeEach(() => {
  bffServerFetch.mockReset();
  redirect.mockClear();
  notFound.mockClear();
});

describe('fetchCustomerBookings', () => {
  it('returns the parsed body on success', async () => {
    bffServerFetch.mockResolvedValue(jsonResponse({ items: [] }));
    await expect(fetchCustomerBookings('token')).resolves.toEqual({ items: [] });
  });

  it('throws a CustomerFetchError carrying the response status on failure', async () => {
    bffServerFetch.mockResolvedValue(jsonResponse(null, false, 401));
    let error: unknown;
    await fetchCustomerBookings('token').catch((err: unknown) => {
      error = err;
    });
    expect(error).toBeInstanceOf(CustomerFetchError);
    expect((error as CustomerFetchError).status).toBe(401);
  });

  it('parses code/field from the response body instead of discarding it', async () => {
    bffServerFetch.mockResolvedValue(
      jsonResponse({ code: 'AUTH_UNAUTHORIZED', field: 'token' }, false, 401),
    );
    let error: unknown;
    await fetchCustomerBookings('token').catch((err: unknown) => {
      error = err;
    });
    expect(error).toMatchObject({ code: 'AUTH_UNAUTHORIZED', field: 'token' });
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
