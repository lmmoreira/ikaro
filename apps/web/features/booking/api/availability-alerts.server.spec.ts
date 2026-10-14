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
  fetchAlertsSummary,
  fetchCustomerAvailabilityAlertOrRedirect,
  fetchCustomerAvailabilityAlerts,
} from './availability-alerts.server';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

function alert(status: string) {
  return { id: `a-${status}`, status };
}

beforeEach(() => {
  bffServerFetch.mockReset();
  redirect.mockClear();
  notFound.mockClear();
});

describe('fetchCustomerAvailabilityAlerts', () => {
  it('reads the list from /availability-alerts', async () => {
    bffServerFetch.mockResolvedValue(jsonResponse({ items: [alert('ACTIVE')] }));

    await expect(fetchCustomerAvailabilityAlerts('token')).resolves.toEqual({
      items: [alert('ACTIVE')],
    });
    expect(bffServerFetch).toHaveBeenCalledWith('token', '/availability-alerts');
  });

  it('throws a CustomerFetchError carrying the status on failure', async () => {
    bffServerFetch.mockResolvedValue(jsonResponse(null, false, 500));

    await expect(fetchCustomerAvailabilityAlerts('token')).rejects.toBeInstanceOf(
      CustomerFetchError,
    );
  });
});

describe('fetchAlertsSummary', () => {
  it('counts the active alerts and reports that some exist', async () => {
    bffServerFetch.mockResolvedValue(
      jsonResponse({
        items: [alert('ACTIVE'), alert('ACTIVE'), alert('NOTIFIED'), alert('EXPIRED')],
      }),
    );

    await expect(fetchAlertsSummary('token')).resolves.toEqual({ hasAny: true, activeCount: 2 });
  });

  it('counts an all-finished customer as having alerts, with zero active', async () => {
    bffServerFetch.mockResolvedValue(jsonResponse({ items: [alert('NOTIFIED')] }));

    await expect(fetchAlertsSummary('token')).resolves.toEqual({ hasAny: true, activeCount: 0 });
  });

  it('does not count a cancelled alert — it no longer exists for the customer', async () => {
    bffServerFetch.mockResolvedValue(jsonResponse({ items: [alert('CANCELLED')] }));

    await expect(fetchAlertsSummary('token')).resolves.toEqual({ hasAny: false, activeCount: 0 });
  });

  it('reports no alerts for an empty list', async () => {
    bffServerFetch.mockResolvedValue(jsonResponse({ items: [] }));

    await expect(fetchAlertsSummary('token')).resolves.toEqual({ hasAny: false, activeCount: 0 });
  });

  it('resolves to null on a failed response instead of throwing (the tab must keep rendering)', async () => {
    bffServerFetch.mockResolvedValue(jsonResponse(null, false, 500));

    await expect(fetchAlertsSummary('token')).resolves.toBeNull();
  });

  it('resolves to null on a network error', async () => {
    bffServerFetch.mockRejectedValue(new Error('network down'));

    await expect(fetchAlertsSummary('token')).resolves.toBeNull();
  });

  it('does not redirect to login on an expired session — the bookings read owns that', async () => {
    bffServerFetch.mockResolvedValue(jsonResponse(null, false, 401));

    await expect(fetchAlertsSummary('token')).resolves.toBeNull();
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe('fetchCustomerAvailabilityAlertOrRedirect', () => {
  it('reads one alert by id, whatever its status', async () => {
    bffServerFetch.mockResolvedValue(jsonResponse(alert('EXPIRED')));

    await expect(
      fetchCustomerAvailabilityAlertOrRedirect('token', 'abc', 'vitta'),
    ).resolves.toEqual(alert('EXPIRED'));
    expect(bffServerFetch).toHaveBeenCalledWith('token', '/availability-alerts/abc');
  });

  it('is a 404 for an unknown or foreign id', async () => {
    bffServerFetch.mockResolvedValue(jsonResponse(null, false, 404));

    await expect(fetchCustomerAvailabilityAlertOrRedirect('token', 'abc', 'vitta')).rejects.toThrow(
      'NEXT_NOT_FOUND',
    );
  });

  it('is a 404 for a cancelled alert — it no longer exists for the customer', async () => {
    bffServerFetch.mockResolvedValue(jsonResponse(alert('CANCELLED')));

    await expect(fetchCustomerAvailabilityAlertOrRedirect('token', 'abc', 'vitta')).rejects.toThrow(
      'NEXT_NOT_FOUND',
    );
  });

  it.each([401, 403])('sends a %s to the tenant login', async (status) => {
    bffServerFetch.mockResolvedValue(jsonResponse(null, false, status));

    await expect(fetchCustomerAvailabilityAlertOrRedirect('token', 'abc', 'vitta')).rejects.toThrow(
      'NEXT_REDIRECT',
    );
    expect(redirect).toHaveBeenCalledWith('/vitta/login');
  });

  it('rethrows any other failure', async () => {
    bffServerFetch.mockResolvedValue(jsonResponse(null, false, 500));

    await expect(
      fetchCustomerAvailabilityAlertOrRedirect('token', 'abc', 'vitta'),
    ).rejects.toBeInstanceOf(CustomerFetchError);
  });
});
