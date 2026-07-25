import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

describe('same-origin BFF gateway', () => {
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

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://bff.example.test/v1/bookings?limit=10',
      expect.objectContaining({
        method: 'GET',
        headers: expect.any(Headers),
        redirect: 'manual',
      }),
    );
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

    const response = await GET(new NextRequest('https://web.example.test/v1/auth/google/callback'), {
      params: Promise.resolve({ path: ['auth', 'google', 'callback'] }),
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('set-cookie')).toContain('__Host-access_token=signed-token');
  });
});
