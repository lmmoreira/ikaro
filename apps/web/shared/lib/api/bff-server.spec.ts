import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bffPublicFetch, bffServerFetch } from './bff-server';

const BFF_URL = 'http://bff-test:3002';

describe('bffPublicFetch', () => {
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
    await bffPublicFetch('/bookings');
    expect(fetchSpy).toHaveBeenCalledWith(`${BFF_URL}/bookings`, expect.any(Object));
  });

  it('defaults to cache: no-store', async () => {
    await bffPublicFetch('/bookings');
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('adds a default timeout signal when none is provided', async () => {
    await bffPublicFetch('/bookings');
    const requestInit = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(requestInit?.signal).toBeInstanceOf(AbortSignal);
  });

  it('prefers next.revalidate over cache when both are provided', async () => {
    await bffPublicFetch('/tenants/settings', {
      cache: 'force-cache',
      next: { revalidate: 300 },
    });
    const requestInit = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(requestInit?.cache).toBeUndefined();
    expect(requestInit?.next).toEqual({ revalidate: 300 });
  });

  it('honours an explicit cache value when next.revalidate is absent', async () => {
    await bffPublicFetch('/tenants/settings', {
      cache: 'force-cache',
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ cache: 'force-cache' }),
    );
  });

  it('forwards method and body', async () => {
    await bffPublicFetch('/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: 'b-1' }),
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: 'POST', body: expect.any(String) }),
    );
  });
});

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

  it('adds the access_token cookie header', async () => {
    await bffServerFetch('tok', '/bookings');
    expect(fetchSpy).toHaveBeenCalledWith(
      `${BFF_URL}/bookings`,
      expect.objectContaining({
        headers: expect.objectContaining({ Cookie: 'access_token=tok' }),
      }),
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

  it('preserves method and body when wrapping the shared transport', async () => {
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
