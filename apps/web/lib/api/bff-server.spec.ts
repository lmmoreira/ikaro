import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bffServerFetch } from './bff-server';

const BFF_URL = 'http://bff-test:3002';

describe('bffServerFetch', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_BFF_URL = BFF_URL;
    fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
      );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('builds the full URL from NEXT_PUBLIC_BFF_URL + path', async () => {
    await bffServerFetch('tok', '/bookings');
    expect(fetchSpy).toHaveBeenCalledWith(
      `${BFF_URL}/bookings`,
      expect.objectContaining({ headers: expect.objectContaining({ Cookie: 'access_token=tok' }) }),
    );
  });

  it('defaults to cache: no-store', async () => {
    await bffServerFetch('tok', '/bookings');
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('honours an explicit cache value', async () => {
    await bffServerFetch('tok', '/tenants/formatting', {
      cache: 'force-cache',
      next: { revalidate: 300 },
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ cache: 'force-cache' }),
    );
  });

  it('merges extra headers with the Cookie header', async () => {
    await bffServerFetch('tok', '/customers/me', { headers: { 'X-Tenant-Slug': 'acme' } });
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: { Cookie: 'access_token=tok', 'X-Tenant-Slug': 'acme' },
      }),
    );
  });

  it('forwards method and body', async () => {
    await bffServerFetch('tok', '/auth/switch-tenant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetTenantId: 't-2' }),
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: 'POST', body: expect.any(String) }),
    );
  });
});
