import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HotsiteServiceResponse } from '@ikaro/types';
import { fetchServices } from './services';

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
        headers: { 'X-Tenant-Slug': 'lavacar-beloauto' },
        next: { revalidate: 300 },
      }),
    );
  });

  it('throws when the BFF returns an error', async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 500 }));

    await expect(fetchServices('lavacar-beloauto')).rejects.toThrow(/Failed to fetch services/);
  });
});
