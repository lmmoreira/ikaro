import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CustomerProfileResponse } from '@ikaro/types';
import {
  getHotsiteCustomerProfile,
  updateHotsiteCustomerProfile,
  UpdateHotsiteCustomerProfileError,
} from './customers';

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

  it('returns null when fetch rejects (network error)', async () => {
    fetchSpy.mockRejectedValue(new Error('network error'));

    const result = await getHotsiteCustomerProfile();

    expect(result).toBeNull();
  });
});

describe('updateHotsiteCustomerProfile', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('PATCHes the phone and returns the updated profile', async () => {
    const profile: CustomerProfileResponse = {
      customerId: 'c-1',
      email: 'joao@example.com',
      name: 'João Silva',
      phone: '+5511999999999',
      defaultAddress: null,
    };
    fetchSpy.mockResolvedValue(new Response(JSON.stringify(profile), { status: 200 }));

    const result = await updateHotsiteCustomerProfile({ phone: '+5511999999999' });

    expect(result).toEqual(profile);
    expect(fetchSpy).toHaveBeenCalledWith('/api/customers/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '+5511999999999' }),
    });
  });

  it('throws UpdateHotsiteCustomerProfileError with the status on failure', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ violations: [] }), { status: 400 }));

    await expect(updateHotsiteCustomerProfile({ phone: 'bad' })).rejects.toMatchObject(
      new UpdateHotsiteCustomerProfileError(400),
    );
  });
});
