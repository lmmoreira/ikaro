import { beforeEach, describe, expect, it, vi } from 'vitest';

const bffServerFetch = vi.hoisted(() => vi.fn());
vi.mock('@/shared/lib/api/bff-server', () => ({ bffServerFetch }));

import { fetchTenantAccess } from './access.server';

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
