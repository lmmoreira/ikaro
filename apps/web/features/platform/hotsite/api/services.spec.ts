import MockAdapter from 'axios-mock-adapter';
import { afterEach, describe, expect, it } from 'vitest';
import type { HotsiteServiceResponse } from '@ikaro/types';
import { bffClient } from '@/shared/lib/api/bff-client';
import { fetchServicesClient } from './services';

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

describe('fetchServicesClient', () => {
  const mock = new MockAdapter(bffClient);

  afterEach(() => mock.reset());

  it('returns the services list via bffClient (same-origin /v1 gateway, no Next cache options)', async () => {
    const service = makeService();
    mock.onGet('/public/services').reply(200, { items: [service] });

    const result = await fetchServicesClient('lavacar-beloauto');

    expect(result).toEqual([service]);
    expect(mock.history.get?.[0]?.headers?.['X-Tenant-Slug']).toBe('lavacar-beloauto');
  });

  it('rejects when the BFF returns an error', async () => {
    mock.onGet('/public/services').reply(500);

    await expect(fetchServicesClient('lavacar-beloauto')).rejects.toThrow();
  });
});
