import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getBffAuthorizationHeader = vi.hoisted(() => vi.fn());

vi.mock('@/shared/lib/auth/google-identity-token', () => ({
  getBffAuthorizationHeader,
}));

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
    delete process.env.BFF_AUTH_MODE;
    delete process.env.BFF_UPSTREAM_URL;
    fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
      );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    getBffAuthorizationHeader.mockReset();
    delete process.env.BFF_AUTH_MODE;
    delete process.env.BFF_UPSTREAM_URL;
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

  it('strips a caller-supplied title-case X-Web-Internal-Key instead of letting it ride alongside the real one (TD38)', async () => {
    await bffServerFetch('tok', '/bookings', {
      headers: { 'X-Web-Internal-Key': 'attacker-forged-value' },
    });
    const headers = headersFromCall(fetchSpy);
    expect(headers['x-web-internal-key']).toBe('a'.repeat(32));
    expect(headers['X-Web-Internal-Key']).toBeUndefined();
  });

  it('strips a caller-supplied title-case X-Real-Client-Ip regardless of casing (TD38)', async () => {
    await bffServerFetch('tok', '/bookings', {
      headers: { 'X-Real-Client-Ip': '203.0.113.99' },
    });
    const headers = headersFromCall(fetchSpy);
    expect(headers['X-Real-Client-Ip']).toBeUndefined();
  });

  it('strips a caller-supplied Authorization when BFF_AUTH_MODE=iam would otherwise collide with it (TD38)', async () => {
    process.env.BFF_AUTH_MODE = 'iam';
    process.env.BFF_UPSTREAM_URL = BFF_URL;
    getBffAuthorizationHeader.mockResolvedValue('Bearer real-iam-token');

    await bffServerFetch('tok', '/bookings', {
      headers: { Authorization: 'Bearer attacker-forged-token' },
    });

    const headers = headersFromCall(fetchSpy);
    // attachBffAuthHeaders sets it via Headers.set(), which normalizes to lowercase.
    expect(headers['authorization']).toBe('Bearer real-iam-token');
    expect(headers['Authorization']).toBeUndefined();
  });

  it("preserves a caller-supplied Authorization when BFF_AUTH_MODE is not iam (e.g. the signed-url route forwarding the user's own bearer token)", async () => {
    delete process.env.BFF_AUTH_MODE;

    await bffServerFetch('tok', '/bookings', {
      headers: { Authorization: 'Bearer real-user-jwt' },
    });

    const headers = headersFromCall(fetchSpy);
    expect(headers['Authorization']).toBe('Bearer real-user-jwt');
  });
});
