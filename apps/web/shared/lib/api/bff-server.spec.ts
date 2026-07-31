import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bffPublicFetch, bffServerFetch } from './bff-server';

const BFF_URL = 'http://bff-test:3002';

function headersFromCall(
  fetchSpy: ReturnType<typeof vi.spyOn>,
  callIndex = 0,
): Record<string, string> {
  const requestInit = fetchSpy.mock.calls[callIndex]?.[1] as RequestInit | undefined;
  return requestInit?.headers as Record<string, string>;
}

describe('bffPublicFetch', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_BFF_URL = BFF_URL;
    // TD38: attachBffAuthHeaders() requires this on every call, regardless of auth mode.
    process.env.WEB_INTERNAL_KEY = 'a'.repeat(32);
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
    expect(headersFromCall(fetchSpy)['Content-Type']).toBe('application/json');
  });

  it('attaches X-Web-Internal-Key on every call (TD38)', async () => {
    await bffPublicFetch('/bookings');
    expect(headersFromCall(fetchSpy)['x-web-internal-key']).toBe('a'.repeat(32));
  });

  it('throws when WEB_INTERNAL_KEY is unset', async () => {
    delete process.env.WEB_INTERNAL_KEY;
    await expect(bffPublicFetch('/bookings')).rejects.toThrow('WEB_INTERNAL_KEY is required');
  });

  it('does not attach an Authorization header when BFF_AUTH_MODE is unset (default "none")', async () => {
    delete process.env.BFF_AUTH_MODE;
    await bffPublicFetch('/bookings');
    expect(headersFromCall(fetchSpy)['authorization']).toBeUndefined();
  });
});

describe('bffServerFetch', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_BFF_URL = BFF_URL;
    process.env.WEB_INTERNAL_KEY = 'a'.repeat(32);
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
    expect(fetchSpy).toHaveBeenCalledWith(`${BFF_URL}/bookings`, expect.any(Object));
    expect(headersFromCall(fetchSpy)['Cookie']).toBe('access_token=tok');
  });

  it('merges extra headers with the Cookie header', async () => {
    await bffServerFetch('tok', '/customers/me', { headers: { 'X-Tenant-Slug': 'acme' } });
    const headers = headersFromCall(fetchSpy);
    expect(headers['Cookie']).toBe('access_token=tok');
    expect(headers['X-Tenant-Slug']).toBe('acme');
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

  it('attaches X-Web-Internal-Key alongside the Cookie header (TD38)', async () => {
    await bffServerFetch('tok', '/bookings');
    const headers = headersFromCall(fetchSpy);
    expect(headers['Cookie']).toBe('access_token=tok');
    expect(headers['x-web-internal-key']).toBe('a'.repeat(32));
  });
});
