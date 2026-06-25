import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const BFF_URL = 'http://bff-test:3002';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/auth/staff-token', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/staff-token', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_BFF_URL = BFF_URL;
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  it('forwards the body to the BFF and relays the Set-Cookie header back', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ tenantSlug: 'lavacar-bh', expiresIn: '7d' }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'set-cookie': 'access_token=signed-jwt; HttpOnly; Path=/',
        },
      }),
    );

    const response = await POST(makeRequest({ selectionToken: 'sel-token', staffId: 's-1' }));
    const body = await response.json();

    expect(fetchSpy).toHaveBeenCalledWith(`${BFF_URL}/auth/staff-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectionToken: 'sel-token', staffId: 's-1' }),
      cache: 'no-store',
    });
    expect(response.status).toBe(200);
    expect(body).toEqual({ tenantSlug: 'lavacar-bh', expiresIn: '7d' });
    expect(response.headers.get('set-cookie')).toBe('access_token=signed-jwt; HttpOnly; Path=/');
  });

  it('passes through a 403 from the BFF without a Set-Cookie header', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ status: 403 }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const response = await POST(makeRequest({ selectionToken: 'sel-token', staffId: 'wrong' }));

    expect(response.status).toBe(403);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('returns a sanitized 502 when the BFF fetch throws', async () => {
    fetchSpy.mockRejectedValue(new Error('connection refused'));

    const response = await POST(makeRequest({ selectionToken: 'sel-token', staffId: 's-1' }));
    const body = (await response.json()) as { message: string };

    expect(response.status).toBe(502);
    expect(body.message).not.toMatch(/connection refused/);
  });
});
