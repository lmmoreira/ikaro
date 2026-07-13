import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Address, CustomerProfileResponse } from '@ikaro/types';
import {
  FetchCustomerProfileError,
  getHotsiteCustomerProfile,
  updateHotsiteCustomerProfile,
  UpdateHotsiteCustomerProfileError,
} from './customers';

const address: Address = {
  street: 'Rua das Acácias',
  number: '45',
  complement: '',
  neighborhood: 'Jardim América',
  city: 'Belo Horizonte',
  state: 'MG',
  zipCode: '30130-020',
};

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

    const result = await getHotsiteCustomerProfile('lavacar-beloauto');

    expect(result).toEqual(profile);
    expect(fetchSpy).toHaveBeenCalledWith('/api/customers/me?slug=lavacar-beloauto');
  });

  it('returns null when the request is unauthorized', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 }),
    );

    const result = await getHotsiteCustomerProfile('lavacar-beloauto');

    expect(result).toBeNull();
  });

  it('returns null when the JWT tenant does not match the requested hotsite (403)', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ message: 'Forbidden' }), { status: 403 }),
    );

    const result = await getHotsiteCustomerProfile('ikaro');

    expect(result).toBeNull();
  });

  it('returns null when fetch rejects (network error)', async () => {
    fetchSpy.mockRejectedValue(new Error('network error'));

    const result = await getHotsiteCustomerProfile('lavacar-beloauto');

    expect(result).toBeNull();
  });

  it('throws a FetchCustomerProfileError carrying code/field for a non-401/403 failure', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ code: 'PLATFORM_TENANT_INACTIVE' }), { status: 500 }),
    );

    await expect(getHotsiteCustomerProfile('lavacar-beloauto')).rejects.toMatchObject({
      status: 500,
      code: 'PLATFORM_TENANT_INACTIVE',
    });
    await expect(getHotsiteCustomerProfile('lavacar-beloauto')).rejects.toBeInstanceOf(
      FetchCustomerProfileError,
    );
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

  it('PATCHes the phone + address and returns the updated profile', async () => {
    const profile: CustomerProfileResponse = {
      customerId: 'c-1',
      email: 'joao@example.com',
      name: 'João Silva',
      phone: '+5511999999999',
      defaultAddress: address,
    };
    fetchSpy.mockResolvedValue(new Response(JSON.stringify(profile), { status: 200 }));

    const result = await updateHotsiteCustomerProfile('lavacar-beloauto', {
      phone: '+5511999999999',
      defaultAddress: address,
    });

    expect(result).toEqual(profile);
    expect(fetchSpy).toHaveBeenCalledWith('/api/customers/me?slug=lavacar-beloauto', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '+5511999999999', defaultAddress: address }),
    });
  });

  it('throws UpdateHotsiteCustomerProfileError with the status and violations on failure', async () => {
    const violations = [{ field: 'phone', message: 'phone must be in E.164 format' }];
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ violations }), { status: 400 }));

    await expect(
      updateHotsiteCustomerProfile('lavacar-beloauto', { phone: 'bad', defaultAddress: address }),
    ).rejects.toMatchObject(new UpdateHotsiteCustomerProfileError(400, violations));
  });
});
