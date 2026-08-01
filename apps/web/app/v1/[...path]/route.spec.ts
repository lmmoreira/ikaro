import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getBffAuthorizationHeader = vi.hoisted(() => vi.fn());

vi.mock('@/shared/lib/auth/google-identity-token', () => ({
  getBffAuthorizationHeader,
}));

import { GET } from './route';

describe('same-origin BFF gateway', () => {
  beforeEach(() => {
    // TD38: attachBffAuthHeaders() requires this on every call, regardless of auth mode.
    vi.stubEnv('WEB_INTERNAL_KEY', 'a'.repeat(32));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('forwards the path, query, and cookie to the configured BFF upstream', async () => {
    vi.stubEnv('BFF_UPSTREAM_URL', 'https://bff.example.test/v1');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const request = new NextRequest('https://web.example.test/v1/bookings?limit=10', {
      headers: { cookie: '__Host-access_token=signed-token' },
    });

    const response = await GET(request, { params: Promise.resolve({ path: ['bookings'] }) });

    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe('https://bff.example.test/v1/bookings?limit=10');
    expect(init).toEqual(
      expect.objectContaining({
        method: 'GET',
        headers: expect.any(Headers),
        redirect: 'manual',
        signal: expect.any(AbortSignal),
      }),
    );
    expect((init?.headers as Headers).get('cookie')).toContain('__Host-access_token=signed-token');
    expect(response.status).toBe(200);
  });

  it('preserves a BFF Set-Cookie response for the browser origin', async () => {
    vi.stubEnv('BFF_UPSTREAM_URL', 'https://bff.example.test/v1');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: {
          location: 'https://web.example.test/dashboard',
          'set-cookie': '__Host-access_token=signed-token; Secure; HttpOnly; Path=/',
        },
      }),
    );

    const response = await GET(
      new NextRequest('https://web.example.test/v1/auth/google/callback'),
      {
        params: Promise.resolve({ path: ['auth', 'google', 'callback'] }),
      },
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('set-cookie')).toContain('__Host-access_token=signed-token');
  });

  it('does not forward client-supplied internal identity headers', async () => {
    vi.stubEnv('BFF_UPSTREAM_URL', 'https://bff.example.test/v1');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null));
    const request = new NextRequest('https://web.example.test/v1/bookings', {
      headers: {
        'x-actor-id': 'forged-actor',
        'x-jwt-actor-id': 'forged-jwt-actor',
        'x-tenant-id': 'forged-tenant',
      },
    });

    await GET(request, { params: Promise.resolve({ path: ['bookings'] }) });

    const [, init] = fetchSpy.mock.calls[0] ?? [];
    const headers = init?.headers as Headers;
    expect(headers.get('x-actor-id')).toBeNull();
    expect(headers.get('x-jwt-actor-id')).toBeNull();
    expect(headers.get('x-tenant-id')).toBeNull();
  });

  it('returns a generic 502 when the BFF upstream is unavailable', async () => {
    vi.stubEnv('BFF_UPSTREAM_URL', 'https://bff.example.test/v1');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('connection refused'));

    const response = await GET(new NextRequest('https://web.example.test/v1/bookings'), {
      params: Promise.resolve({ path: ['bookings'] }),
    });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ message: 'Upstream unavailable' });
  });

  it('returns a generic 502 (not an unhandled rejection) when attachBffAuthHeaders throws', async () => {
    vi.stubEnv('BFF_UPSTREAM_URL', 'https://bff.example.test/v1');
    vi.stubEnv('WEB_INTERNAL_KEY', '');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const response = await GET(new NextRequest('https://web.example.test/v1/bookings'), {
      params: Promise.resolve({ path: ['bookings'] }),
    });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ message: 'Upstream unavailable' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  describe('TD38: trusted client-IP and BFF auth headers', () => {
    it('resolves and forwards X-Real-Client-Ip, overwriting any client-supplied value', async () => {
      vi.stubEnv('BFF_UPSTREAM_URL', 'https://bff.example.test/v1');
      vi.stubEnv('APP_ENV', 'production');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null));
      const request = new NextRequest('https://web.example.test/v1/bookings', {
        headers: {
          'cf-connecting-ip': '203.0.113.10',
          'x-real-client-ip': 'attacker-forged-value',
        },
      });

      await GET(request, { params: Promise.resolve({ path: ['bookings'] }) });

      const [, init] = fetchSpy.mock.calls[0] ?? [];
      expect((init?.headers as Headers).get('x-real-client-ip')).toBe('203.0.113.10');
    });

    it('attaches X-Web-Internal-Key on every call', async () => {
      vi.stubEnv('BFF_UPSTREAM_URL', 'https://bff.example.test/v1');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null));

      await GET(new NextRequest('https://web.example.test/v1/bookings'), {
        params: Promise.resolve({ path: ['bookings'] }),
      });

      const [, init] = fetchSpy.mock.calls[0] ?? [];
      expect((init?.headers as Headers).get('x-web-internal-key')).toBe('a'.repeat(32));
    });

    it('does not attach an Authorization header when BFF_AUTH_MODE is unset (default "none")', async () => {
      vi.stubEnv('BFF_UPSTREAM_URL', 'https://bff.example.test/v1');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null));

      await GET(new NextRequest('https://web.example.test/v1/bookings'), {
        params: Promise.resolve({ path: ['bookings'] }),
      });

      const [, init] = fetchSpy.mock.calls[0] ?? [];
      expect((init?.headers as Headers).has('authorization')).toBe(false);
    });

    it('attaches a Google ID token when BFF_AUTH_MODE=iam', async () => {
      vi.stubEnv('BFF_UPSTREAM_URL', 'https://bff.example.test/v1');
      vi.stubEnv('BFF_AUTH_MODE', 'iam');
      getBffAuthorizationHeader.mockResolvedValue('Bearer test-token');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null));

      await GET(new NextRequest('https://web.example.test/v1/bookings'), {
        params: Promise.resolve({ path: ['bookings'] }),
      });

      expect(getBffAuthorizationHeader).toHaveBeenCalledWith('https://bff.example.test');
      const [, init] = fetchSpy.mock.calls[0] ?? [];
      expect((init?.headers as Headers).get('authorization')).toBe('Bearer test-token');
    });
  });
});
