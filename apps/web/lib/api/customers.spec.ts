import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CustomerProfileResponse } from '@ikaro/types';
import { getHotsiteCustomerProfile } from './customers';

describe('getHotsiteCustomerProfile', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns the profile on a successful response', async () => {
    const profile: CustomerProfileResponse = {
      customerId: 'c-1',
      email: 'joao@example.com',
      name: 'João Silva',
      phone: null,
      defaultAddress: null,
    };
    fetchSpy.mockResolvedValue(new Response(JSON.stringify(profile), { status: 200 }));

    const result = await getHotsiteCustomerProfile();

    expect(result).toEqual(profile);
    expect(fetchSpy).toHaveBeenCalledWith('/api/customers/me');
  });

  it('returns null when the request is unauthorized', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 }),
    );

    const result = await getHotsiteCustomerProfile();

    expect(result).toBeNull();
  });
});
