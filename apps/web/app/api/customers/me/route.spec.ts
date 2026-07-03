import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockCookieGet = vi.fn();

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockImplementation(() => ({ get: mockCookieGet })),
}));

import { GET, PATCH } from './route';

const BFF_URL = 'http://bff-test:3002';

function makeGetRequest(slug?: string): NextRequest {
  const url = slug
    ? `http://localhost/api/customers/me?slug=${slug}`
    : 'http://localhost/api/customers/me';
  return new NextRequest(url);
}

function makePatchRequest(body: unknown, slug?: string): NextRequest {
  const url = slug
    ? `http://localhost/api/customers/me?slug=${slug}`
    : 'http://localhost/api/customers/me';
  return new NextRequest(url, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

describe('GET /api/customers/me', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_BFF_URL = BFF_URL;
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    mockCookieGet.mockReset();
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns 401 without calling the BFF when there is no access_token cookie', async () => {
    mockCookieGet.mockReturnValue(undefined);

    const response = await GET(makeGetRequest());

    expect(response.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('forwards the access_token cookie and the slug as X-Tenant-Slug, passing through a successful response', async () => {
    mockCookieGet.mockReturnValue({ value: 'signed-jwt' });
    const profile = { customerId: 'c-1', email: 'joao@example.com', name: 'João Silva' };
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(profile), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const response = await GET(makeGetRequest('lavacar-beloauto'));
    const body = await response.json();

    expect(fetchSpy).toHaveBeenCalledWith(`${BFF_URL}/customers/me`, {
      headers: { Cookie: 'access_token=signed-jwt', 'X-Tenant-Slug': 'lavacar-beloauto' },
      cache: 'no-store',
      signal: expect.any(AbortSignal),
    });
    expect(response.status).toBe(200);
    expect(body).toEqual(profile);
  });

  it('omits X-Tenant-Slug when no slug query param is present', async () => {
    mockCookieGet.mockReturnValue({ value: 'signed-jwt' });
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await GET(makeGetRequest());

    expect(fetchSpy).toHaveBeenCalledWith(`${BFF_URL}/customers/me`, {
      headers: { Cookie: 'access_token=signed-jwt' },
      cache: 'no-store',
      signal: expect.any(AbortSignal),
    });
  });

  it('passes through a 403 when the JWT tenant does not match the requested slug', async () => {
    mockCookieGet.mockReturnValue({ value: 'signed-jwt-for-beloauto' });
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ message: 'Forbidden' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const response = await GET(makeGetRequest('ikaro'));

    expect(response.status).toBe(403);
  });

  it('passes through the BFF status code when the token is rejected', async () => {
    mockCookieGet.mockReturnValue({ value: 'expired-jwt' });
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ message: 'Unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const response = await GET(makeGetRequest());

    expect(response.status).toBe(401);
  });

  it('returns a sanitized 502 when the BFF fetch throws', async () => {
    mockCookieGet.mockReturnValue({ value: 'signed-jwt' });
    fetchSpy.mockRejectedValue(new Error('connection refused'));

    const response = await GET(makeGetRequest());
    const body = (await response.json()) as { message: string };

    expect(response.status).toBe(502);
    expect(body.message).not.toMatch(/connection refused/);
  });

  it('returns a generic error body when the BFF responds with a non-JSON content type', async () => {
    mockCookieGet.mockReturnValue({ value: 'signed-jwt' });
    fetchSpy.mockResolvedValue(
      new Response('<html>Bad Gateway</html>', {
        status: 502,
        headers: { 'content-type': 'text/html' },
      }),
    );

    const response = await GET(makeGetRequest());
    const body = (await response.json()) as { message: string };

    expect(response.status).toBe(502);
    expect(body.message).toBe('Upstream error');
  });
});

describe('PATCH /api/customers/me', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_BFF_URL = BFF_URL;
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    mockCookieGet.mockReset();
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns 401 without calling the BFF when there is no access_token cookie', async () => {
    mockCookieGet.mockReturnValue(undefined);

    const response = await PATCH(makePatchRequest({ phone: '+5511999999999' }));

    expect(response.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('forwards the cookie, body, and slug as X-Tenant-Slug, passing through a successful response', async () => {
    mockCookieGet.mockReturnValue({ value: 'signed-jwt' });
    const profile = { customerId: 'c-1', email: 'joao@example.com', phone: '+5511999999999' };
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(profile), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const response = await PATCH(makePatchRequest({ phone: '+5511999999999' }, 'lavacar-beloauto'));
    const body = await response.json();

    expect(fetchSpy).toHaveBeenCalledWith(`${BFF_URL}/customers/me`, {
      method: 'PATCH',
      headers: {
        Cookie: 'access_token=signed-jwt',
        'Content-Type': 'application/json',
        'X-Tenant-Slug': 'lavacar-beloauto',
      },
      body: JSON.stringify({ phone: '+5511999999999' }),
      cache: 'no-store',
      signal: expect.any(AbortSignal),
    });
    expect(response.status).toBe(200);
    expect(body).toEqual(profile);
  });

  it('passes through a 400 validation error from the BFF', async () => {
    mockCookieGet.mockReturnValue({ value: 'signed-jwt' });
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ status: 400, violations: [] }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const response = await PATCH(makePatchRequest({ phone: 'not-e164' }));

    expect(response.status).toBe(400);
  });

  it('returns a sanitized 502 when the BFF fetch throws', async () => {
    mockCookieGet.mockReturnValue({ value: 'signed-jwt' });
    fetchSpy.mockRejectedValue(new Error('connection refused'));

    const response = await PATCH(makePatchRequest({ phone: '+5511999999999' }));
    const body = (await response.json()) as { message: string };

    expect(response.status).toBe(502);
    expect(body.message).not.toMatch(/connection refused/);
  });
});
