import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HotsiteServiceResponse } from '@ikaro/types';
import { fetchServiceBySlug, fetchServices } from './services.server';
import { hotsiteServiceBookingDefaults } from '@/test-utils';

const BFF_URL = 'http://bff-test:3002';

function makeService(overrides?: Partial<HotsiteServiceResponse>): HotsiteServiceResponse {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Lavagem Completa',
    description: 'Lavagem externa e interna',
    price: { amount: 150, currency: 'BRL', formatted: 'R$ 150,00' },
    durationMinutes: 60,
    loyaltyPointsValue: 10,
    requiresPickupAddress: false,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...hotsiteServiceBookingDefaults,
    ...overrides,
  };
}

describe('fetchServices', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_BFF_URL = BFF_URL;
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns the services list on a successful BFF response', async () => {
    const service = makeService();
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ items: [service] }), { status: 200 }));

    const result = await fetchServices('lavacar-beloauto');

    expect(result).toEqual([service]);
    expect(fetchSpy).toHaveBeenCalledWith(
      `${BFF_URL}/public/services`,
      expect.objectContaining({
        headers: {
          'X-Tenant-Slug': 'lavacar-beloauto',
          'x-web-internal-key': 'test-web-internal-key-test-web-internal-key',
        },
        next: { revalidate: 300, tags: ['hotsite-services-lavacar-beloauto'] },
      }),
    );
  });

  it('throws when the BFF returns an error', async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 500 }));

    await expect(fetchServices('lavacar-beloauto')).rejects.toThrow(/Failed to fetch services/);
  });
});

describe('fetchServiceBySlug', () => {
  const detail = {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Massagem',
    description: null,
    price: { amount: 120, currency: 'BRL', formatted: 'R$ 120,00' },
    durationMinutes: 60,
    loyaltyPointsValue: 8,
    durationPolicy: 'FIXED',
    publicSlug: 'massagem',
    profile: {
      coverImageUrl: null,
      galleryImageUrls: [],
      longDescription: null,
      inclusions: [],
      preparationNotes: null,
    },
  };
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_BFF_URL = BFF_URL;
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('reads the by-slug path for the tenant and carries the shared services cache tag', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify(detail), { status: 200 }));

    const result = await fetchServiceBySlug('vitta', 'massagem');

    expect(result).toEqual(detail);
    expect(fetchSpy).toHaveBeenCalledWith(
      `${BFF_URL}/public/services/by-slug/massagem`,
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Tenant-Slug': 'vitta' }),
        // The same tag service create/update revalidation clears — no revalidate-route change.
        next: { revalidate: 300, tags: ['hotsite-services-vitta'] },
      }),
    );
  });

  it.each([404, 400])('answers null (no such page) for a %s', async (status) => {
    fetchSpy.mockResolvedValue(new Response(null, { status }));

    await expect(fetchServiceBySlug('vitta', `none-${status}`)).resolves.toBeNull();
  });

  it('throws on a server error rather than pretending the page does not exist', async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 500 }));

    await expect(fetchServiceBySlug('vitta', 'broken')).rejects.toThrow(/Failed to fetch service/);
  });
});
