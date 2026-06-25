import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockCookieGet = vi.fn();

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockImplementation(() => ({ get: mockCookieGet })),
}));

import { POST } from './route';

const BFF_URL = 'http://bff-test:3002';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/auth/switch-tenant', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/switch-tenant', () => {
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

    const response = await POST(makeRequest({ targetTenantId: 't-2' }));

    expect(response.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('forwards the cookie + body and relays the new Set-Cookie header back', async () => {
    mockCookieGet.mockReturnValue({ value: 'signed-jwt' });
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ tenantSlug: 'superclean', expiresIn: '7d' }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'set-cookie': 'access_token=new-signed-jwt; HttpOnly; Path=/',
        },
      }),
    );

    const response = await POST(makeRequest({ targetTenantId: 't-2' }));
    const body = await response.json();

    expect(fetchSpy).toHaveBeenCalledWith(
      `${BFF_URL}/auth/switch-tenant`,
      expect.objectContaining({
        method: 'POST',
        headers: { Cookie: 'access_token=signed-jwt', 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetTenantId: 't-2' }),
        cache: 'no-store',
      }),
    );
    expect(response.status).toBe(200);
    expect(body).toEqual({ tenantSlug: 'superclean', expiresIn: '7d' });
    expect(response.headers.get('set-cookie')).toBe(
      'access_token=new-signed-jwt; HttpOnly; Path=/',
    );
  });

  it('passes through a 403 when the target tenant is not in the customer’s tenant list', async () => {
    mockCookieGet.mockReturnValue({ value: 'signed-jwt' });
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ status: 403 }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const response = await POST(makeRequest({ targetTenantId: 'not-mine' }));

    expect(response.status).toBe(403);
  });

  it('returns a sanitized 502 when the BFF fetch throws', async () => {
    mockCookieGet.mockReturnValue({ value: 'signed-jwt' });
    fetchSpy.mockRejectedValue(new Error('connection refused'));

    const response = await POST(makeRequest({ targetTenantId: 't-2' }));
    const body = (await response.json()) as { message: string };

    expect(response.status).toBe(502);
    expect(body.message).not.toMatch(/connection refused/);
  });
});
