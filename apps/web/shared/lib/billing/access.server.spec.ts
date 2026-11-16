import { beforeEach, describe, expect, it, vi } from 'vitest';

const bffServerFetch = vi.hoisted(() => vi.fn());
vi.mock('@/shared/lib/api/bff-server', () => ({ bffServerFetch }));

import { fetchCustomerTenantOperational, fetchTenantAccess } from './access.server';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

beforeEach(() => {
  bffServerFetch.mockReset();
});

describe('fetchTenantAccess', () => {
  it('reads the caller own access answer through the BFF', async () => {
    bffServerFetch.mockResolvedValue(
      jsonResponse({
        status: 'ACTIVE',
        operational: true,
        features: [{ key: 'HOTSITE', tier: 'STANDARD' }],
      }),
    );

    await expect(fetchTenantAccess('token')).resolves.toEqual({
      ok: true,
      access: { operational: true, features: ['HOTSITE'] },
    });
    expect(bffServerFetch).toHaveBeenCalledWith('token', '/billing/access', {
      cache: 'no-store',
    });
  });

  it.each([401, 403, 500, 503])('fails open on a %s answer', async (status) => {
    bffServerFetch.mockResolvedValue(jsonResponse({}, false, status));

    await expect(fetchTenantAccess('token')).resolves.toEqual({ ok: false });
  });

  it('fails open when the request throws', async () => {
    bffServerFetch.mockRejectedValue(new Error('network down'));

    await expect(fetchTenantAccess('token')).resolves.toEqual({ ok: false });
  });

  it('fails open on a body with no features', async () => {
    bffServerFetch.mockResolvedValue(jsonResponse({ operational: true }));

    await expect(fetchTenantAccess('token')).resolves.toEqual({ ok: false });
  });
});

describe('fetchCustomerTenantOperational', () => {
  it('reads operational from the customer-reduced answer, which has no features', async () => {
    bffServerFetch.mockResolvedValue(jsonResponse({ operational: false }));

    await expect(fetchCustomerTenantOperational('token')).resolves.toBe(false);
    expect(bffServerFetch).toHaveBeenCalledWith('token', '/billing/access', {
      cache: 'no-store',
    });
  });

  it('reads an operational tenant as true', async () => {
    bffServerFetch.mockResolvedValue(jsonResponse({ operational: true }));

    await expect(fetchCustomerTenantOperational('token')).resolves.toBe(true);
  });

  it.each([401, 403, 500, 503])('fails open (null) on a %s answer', async (status) => {
    bffServerFetch.mockResolvedValue(jsonResponse({}, false, status));

    await expect(fetchCustomerTenantOperational('token')).resolves.toBeNull();
  });

  it('fails open when the request throws', async () => {
    bffServerFetch.mockRejectedValue(new Error('network down'));

    await expect(fetchCustomerTenantOperational('token')).resolves.toBeNull();
  });

  it.each([{}, { operational: 'no' }, null])('fails open on a malformed body %j', async (body) => {
    bffServerFetch.mockResolvedValue(jsonResponse(body));

    await expect(fetchCustomerTenantOperational('token')).resolves.toBeNull();
  });
});
