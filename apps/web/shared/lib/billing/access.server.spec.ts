import { beforeEach, describe, expect, it, vi } from 'vitest';

const bffServerFetch = vi.hoisted(() => vi.fn());
vi.mock('@/shared/lib/api/bff-server', () => ({ bffServerFetch }));

// React's `cache` memoizes only inside a server render; this stand-in memoizes per call arguments
// until `resetRenderCache()`, so a spec can tell one shared read from two.
const renderCache = vi.hoisted(() => {
  const stores: Map<string, unknown>[] = [];
  return {
    cache: <A extends unknown[], R>(fn: (...args: A) => R) => {
      const store = new Map<string, unknown>();
      stores.push(store);
      return (...args: A): R => {
        const key = JSON.stringify(args);
        if (!store.has(key)) store.set(key, fn(...args));
        return store.get(key) as R;
      };
    },
    reset: () => stores.forEach((store) => store.clear()),
  };
});
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  cache: renderCache.cache,
}));

const redirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
);
vi.mock('next/navigation', () => ({ redirect }));

import {
  fetchCustomerFeatures,
  fetchCustomerTenantOperational,
  fetchTenantAccess,
  redirectCustomerWhenSuspended,
} from './access.server';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

beforeEach(() => {
  renderCache.reset();
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

  it.each([42, 'oops', { operational: true, features: [null] }])(
    'fails open, never throws, on a body of the wrong shape %j',
    async (body) => {
      bffServerFetch.mockResolvedValue(jsonResponse(body));

      await expect(fetchTenantAccess('token')).resolves.toEqual({ ok: false });
    },
  );
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

describe('fetchCustomerFeatures', () => {
  it('reads the customer-facing features the tenant holds from the one access answer', async () => {
    bffServerFetch.mockResolvedValue(jsonResponse({ operational: true, features: ['BOOKING'] }));

    await expect(fetchCustomerFeatures('token')).resolves.toEqual(['BOOKING']);
    expect(bffServerFetch).toHaveBeenCalledWith('token', '/billing/access', {
      cache: 'no-store',
    });
  });

  it('reads a tenant holding none as an empty list, not as unknown', async () => {
    bffServerFetch.mockResolvedValue(jsonResponse({ operational: true, features: [] }));

    await expect(fetchCustomerFeatures('token')).resolves.toEqual([]);
  });

  it('ignores a key this build does not know', async () => {
    bffServerFetch.mockResolvedValue(
      jsonResponse({ operational: true, features: ['LOYALTY', 'FUTURE_MODULE'] }),
    );

    await expect(fetchCustomerFeatures('token')).resolves.toEqual(['LOYALTY']);
  });

  it.each([401, 403, 500, 503])('fails open (null) on a %s answer', async (status) => {
    bffServerFetch.mockResolvedValue(jsonResponse({}, false, status));

    await expect(fetchCustomerFeatures('token')).resolves.toBeNull();
  });

  it('fails open when the request throws', async () => {
    bffServerFetch.mockRejectedValue(new Error('network down'));

    await expect(fetchCustomerFeatures('token')).resolves.toBeNull();
  });

  it.each([[null], [[null]], [[{ key: 'LOYALTY', tier: 'STANDARD' }]], [[42]]])(
    'fails open on a features array that is not plain keys: %j',
    async (features) => {
      bffServerFetch.mockResolvedValue(jsonResponse({ operational: true, features }));

      await expect(fetchCustomerFeatures('token')).resolves.toBeNull();
    },
  );

  it('makes one request when the layout asks for the operational flag and the features together', async () => {
    bffServerFetch.mockResolvedValue(jsonResponse({ operational: true, features: ['BOOKING'] }));

    const [operational, features] = await Promise.all([
      fetchCustomerTenantOperational('token'),
      fetchCustomerFeatures('token'),
    ]);

    expect(operational).toBe(true);
    expect(features).toEqual(['BOOKING']);
    expect(bffServerFetch).toHaveBeenCalledTimes(1);
  });

  it.each([{}, { features: 'all' }, null])('fails open on a malformed body %j', async (body) => {
    bffServerFetch.mockResolvedValue(jsonResponse(body));

    await expect(fetchCustomerFeatures('token')).resolves.toBeNull();
  });
});

describe('redirectCustomerWhenSuspended', () => {
  beforeEach(() => {
    redirect.mockClear();
  });

  it('sends a customer of a suspended tenant to the bookings list, which stays readable', async () => {
    bffServerFetch.mockResolvedValue(jsonResponse({ operational: false }));

    await expect(redirectCustomerWhenSuspended('token', 'lavacar-bh')).rejects.toThrow(
      'NEXT_REDIRECT:/lavacar-bh/my-account/bookings',
    );
  });

  it('does nothing for an operational tenant (negative guarantee)', async () => {
    bffServerFetch.mockResolvedValue(jsonResponse({ operational: true }));

    await expect(redirectCustomerWhenSuspended('token', 'lavacar-bh')).resolves.toBeUndefined();
    expect(redirect).not.toHaveBeenCalled();
  });

  it.each([500, 403])(
    'does not redirect when the access read fails with %i (fail open)',
    async (status) => {
      bffServerFetch.mockResolvedValue(jsonResponse({}, false, status));

      await expect(redirectCustomerWhenSuspended('token', 'lavacar-bh')).resolves.toBeUndefined();
      expect(redirect).not.toHaveBeenCalled();
    },
  );
});
