import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AvailabilityResponse, AvailabilitySummaryResponse } from '@ikaro/types';
import { fetchAvailability, fetchAvailabilitySummary } from './schedule';

const BFF_URL = 'http://bff-test:3002';

describe('fetchAvailabilitySummary', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_BFF_URL = BFF_URL;
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns the day summaries on a successful BFF response', async () => {
    const summary: AvailabilitySummaryResponse = [
      { date: '2026-06-15', available: true, slotCount: 5 },
      { date: '2026-06-16', available: false, slotCount: 0 },
    ];
    fetchSpy.mockResolvedValue(new Response(JSON.stringify(summary), { status: 200 }));

    const result = await fetchAvailabilitySummary('lavacar-beloauto', '2026-06-15', '2026-06-28', [
      'svc-1',
      'svc-2',
    ]);

    expect(result).toEqual(summary);
    expect(fetchSpy).toHaveBeenCalledWith(
      `${BFF_URL}/schedule/availability/summary?from=2026-06-15&to=2026-06-28&serviceIds=svc-1%2Csvc-2`,
      { headers: { 'X-Tenant-Slug': 'lavacar-beloauto' } },
    );
  });

  it('throws when the BFF returns an error', async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 500 }));

    await expect(
      fetchAvailabilitySummary('lavacar-beloauto', '2026-06-15', '2026-06-28', ['svc-1']),
    ).rejects.toThrow(/Failed to fetch availability summary/);
  });
});

describe('fetchAvailability', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_BFF_URL = BFF_URL;
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns the availability for a date on a successful BFF response', async () => {
    const availability: AvailabilityResponse = {
      date: '2026-06-15',
      slots: [{ startsAt: '2026-06-15T09:00:00.000Z', endsAt: '2026-06-15T10:00:00.000Z' }],
      available: true,
    };
    fetchSpy.mockResolvedValue(new Response(JSON.stringify(availability), { status: 200 }));

    const result = await fetchAvailability('lavacar-beloauto', '2026-06-15', ['svc-1']);

    expect(result).toEqual(availability);
    expect(fetchSpy).toHaveBeenCalledWith(
      `${BFF_URL}/schedule/availability?date=2026-06-15&serviceIds=svc-1`,
      { headers: { 'X-Tenant-Slug': 'lavacar-beloauto' } },
    );
  });

  it('throws when the BFF returns an error', async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 500 }));

    await expect(fetchAvailability('lavacar-beloauto', '2026-06-15', ['svc-1'])).rejects.toThrow(
      /Failed to fetch availability/,
    );
  });
});
