import MockAdapter from 'axios-mock-adapter';
import { afterEach, describe, expect, it } from 'vitest';
import type { AvailabilityResponse, AvailabilitySummaryResponse } from '@ikaro/types';
import { bffClient } from '@/shared/lib/api/bff-client';
import { fetchAvailability, fetchAvailabilitySummary } from './schedule';

// A single MockAdapter shared across both describe blocks below — constructing a second
// MockAdapter on the same axios instance replaces the first one's adapter, silently breaking it.
const mock = new MockAdapter(bffClient);

afterEach(() => mock.reset());

describe('fetchAvailabilitySummary', () => {
  it('returns the day summaries on a successful BFF response', async () => {
    const summary: AvailabilitySummaryResponse = [
      { date: '2026-06-15', available: true, slotCount: 5 },
      { date: '2026-06-16', available: false, slotCount: 0 },
    ];
    mock
      .onGet(
        '/schedule/availability/summary?from=2026-06-15&to=2026-06-28&serviceIds=svc-1%2Csvc-2',
      )
      .reply(200, summary);

    const result = await fetchAvailabilitySummary('lavacar-beloauto', '2026-06-15', '2026-06-28', [
      'svc-1',
      'svc-2',
    ]);

    expect(result).toEqual(summary);
    expect(mock.history.get?.[0]?.headers?.['X-Tenant-Slug']).toBe('lavacar-beloauto');
  });

  it('rejects when the BFF returns an error', async () => {
    mock
      .onGet('/schedule/availability/summary?from=2026-06-15&to=2026-06-28&serviceIds=svc-1')
      .reply(500);

    await expect(
      fetchAvailabilitySummary('lavacar-beloauto', '2026-06-15', '2026-06-28', ['svc-1']),
    ).rejects.toThrow();
  });
});

describe('fetchAvailability', () => {
  it('returns the availability for a date on a successful BFF response', async () => {
    const availability: AvailabilityResponse = {
      date: '2026-06-15',
      slots: [{ startsAt: '2026-06-15T09:00:00.000Z', endsAt: '2026-06-15T10:00:00.000Z' }],
      available: true,
    };
    mock.onGet('/schedule/availability?date=2026-06-15&serviceIds=svc-1').reply(200, availability);

    const result = await fetchAvailability('lavacar-beloauto', '2026-06-15', ['svc-1']);

    expect(result).toEqual(availability);
    expect(mock.history.get?.[0]?.headers?.['X-Tenant-Slug']).toBe('lavacar-beloauto');
  });

  it('rejects when the BFF returns an error', async () => {
    mock.onGet('/schedule/availability?date=2026-06-15&serviceIds=svc-1').reply(500);

    await expect(fetchAvailability('lavacar-beloauto', '2026-06-15', ['svc-1'])).rejects.toThrow();
  });
});
