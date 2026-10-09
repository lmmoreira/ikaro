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

import { CustomerFetchError } from '@/shared/lib/api/errors';
import {
  fetchCustomerRecurringScheduleOrRedirect,
  fetchCustomerRecurringSchedules,
  fetchRecurringSummary,
} from './recurring-booking-schedules.server';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

function schedule(status: string) {
  return { id: `s-${status}`, status };
}

beforeEach(() => {
  bffServerFetch.mockReset();
  redirect.mockClear();
  notFound.mockClear();
});

describe('fetchCustomerRecurringSchedules', () => {
  it('asks for up to 100 schedules in one request', async () => {
    bffServerFetch.mockResolvedValue(jsonResponse({ items: [] }));
    await fetchCustomerRecurringSchedules('token');
    expect(bffServerFetch).toHaveBeenCalledWith('token', '/recurring-booking-schedules?limit=100');
  });

  it('throws a CustomerFetchError carrying the status on failure', async () => {
    bffServerFetch.mockResolvedValue(jsonResponse(null, false, 500));
    await expect(fetchCustomerRecurringSchedules('token')).rejects.toBeInstanceOf(
      CustomerFetchError,
    );
  });
});

describe('fetchRecurringSummary', () => {
  it('counts the active schedules and reports that some exist', async () => {
    bffServerFetch.mockResolvedValue(
      jsonResponse({
        items: [schedule('ACTIVE'), schedule('ACTIVE'), schedule('ENDED'), schedule('CANCELLED')],
      }),
    );
    await expect(fetchRecurringSummary('token')).resolves.toEqual({
      hasAny: true,
      activeCount: 2,
    });
  });

  it('counts an all-ended customer as having schedules, with zero active', async () => {
    bffServerFetch.mockResolvedValue(jsonResponse({ items: [schedule('ENDED')] }));
    await expect(fetchRecurringSummary('token')).resolves.toEqual({
      hasAny: true,
      activeCount: 0,
    });
  });

  it('reports no schedules for an empty list', async () => {
    bffServerFetch.mockResolvedValue(jsonResponse({ items: [] }));
    await expect(fetchRecurringSummary('token')).resolves.toEqual({
      hasAny: false,
      activeCount: 0,
    });
  });

  it('resolves to null on a failed response instead of throwing (the tab must keep rendering)', async () => {
    bffServerFetch.mockResolvedValue(jsonResponse(null, false, 500));
    await expect(fetchRecurringSummary('token')).resolves.toBeNull();
  });

  it('resolves to null on a network error', async () => {
    bffServerFetch.mockRejectedValue(new Error('network down'));
    await expect(fetchRecurringSummary('token')).resolves.toBeNull();
  });

  it('does not redirect to login on an expired session — the bookings read owns that', async () => {
    bffServerFetch.mockResolvedValue(jsonResponse(null, false, 401));
    await expect(fetchRecurringSummary('token')).resolves.toBeNull();
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe('fetchCustomerRecurringScheduleOrRedirect', () => {
  it('returns the schedule on success', async () => {
    bffServerFetch.mockResolvedValue(jsonResponse(schedule('ACTIVE')));
    await expect(
      fetchCustomerRecurringScheduleOrRedirect('token', 'abc', 'lavacar'),
    ).resolves.toEqual(schedule('ACTIVE'));
    expect(bffServerFetch).toHaveBeenCalledWith('token', '/recurring-booking-schedules/abc');
  });

  it('turns a 404 into notFound() — an unknown or foreign schedule', async () => {
    bffServerFetch.mockResolvedValue(jsonResponse(null, false, 404));
    await expect(
      fetchCustomerRecurringScheduleOrRedirect('token', 'abc', 'lavacar'),
    ).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalled();
  });

  it.each([401, 403])('redirects a %s to the tenant login', async (status) => {
    bffServerFetch.mockResolvedValue(jsonResponse(null, false, status));
    await expect(
      fetchCustomerRecurringScheduleOrRedirect('token', 'abc', 'lavacar'),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/lavacar/login');
  });

  it('rethrows any other failure', async () => {
    bffServerFetch.mockResolvedValue(jsonResponse(null, false, 500));
    await expect(
      fetchCustomerRecurringScheduleOrRedirect('token', 'abc', 'lavacar'),
    ).rejects.toBeInstanceOf(CustomerFetchError);
    expect(redirect).not.toHaveBeenCalled();
    expect(notFound).not.toHaveBeenCalled();
  });
});
