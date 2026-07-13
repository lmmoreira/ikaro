import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AuthFetchError,
  fetchCustomerTenants,
  fetchStaffTenants,
  switchStaffTenant,
  switchTenant,
} from './api';

describe('fetchStaffTenants', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('calls the proxy route with no extra params and returns the list', async () => {
    const options = [
      {
        staffId: 's-1',
        tenantId: 't-1',
        tenantSlug: 'lavacar-bh',
        tenantName: 'Lavacar BH',
        role: 'STAFF',
      },
    ];
    fetchSpy.mockResolvedValue(new Response(JSON.stringify(options), { status: 200 }));

    const result = await fetchStaffTenants();

    expect(fetchSpy).toHaveBeenCalledWith('/api/auth/staff-tenants');
    expect(result).toEqual(options);
  });

  it('throws AuthFetchError with the status on failure', async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 401 }));

    await expect(fetchStaffTenants()).rejects.toMatchObject(new AuthFetchError(401));
  });

  it('parses code/field from the response body instead of discarding it', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ code: 'AUTH_UNAUTHORIZED' }), { status: 401 }),
    );

    await expect(fetchStaffTenants()).rejects.toMatchObject({
      status: 401,
      code: 'AUTH_UNAUTHORIZED',
    });
  });
});

describe('switchStaffTenant', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('POSTs the staffId and returns the tenantSlug', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ tenantSlug: 'lavacar-bh' }), { status: 200 }),
    );

    const result = await switchStaffTenant('s-1');

    expect(fetchSpy).toHaveBeenCalledWith('/api/auth/switch-staff-tenant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staffId: 's-1' }),
    });
    expect(result).toEqual({ tenantSlug: 'lavacar-bh' });
  });

  it('throws AuthFetchError on failure', async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 403 }));

    await expect(switchStaffTenant('s-1')).rejects.toMatchObject(new AuthFetchError(403));
  });
});

describe('fetchCustomerTenants', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('calls the proxy route and returns TenantOption[]', async () => {
    const tenants = [{ id: 't-2', name: 'SuperClean', slug: 'superclean', loyaltyPoints: 8 }];
    fetchSpy.mockResolvedValue(new Response(JSON.stringify(tenants), { status: 200 }));

    const result = await fetchCustomerTenants();

    expect(fetchSpy).toHaveBeenCalledWith('/api/customers/tenants');
    expect(result).toEqual(tenants);
  });

  it('throws AuthFetchError on failure', async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 401 }));

    await expect(fetchCustomerTenants()).rejects.toMatchObject(new AuthFetchError(401));
  });
});

describe('switchTenant', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('POSTs the targetTenantId and returns the response', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ tenantSlug: 'superclean', expiresIn: '7d' }), { status: 200 }),
    );

    const result = await switchTenant('t-2');

    expect(fetchSpy).toHaveBeenCalledWith('/api/auth/switch-tenant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetTenantId: 't-2' }),
    });
    expect(result).toEqual({ tenantSlug: 'superclean', expiresIn: '7d' });
  });

  it('throws AuthFetchError on failure', async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 403 }));

    await expect(switchTenant('t-2')).rejects.toMatchObject(new AuthFetchError(403));
  });
});
