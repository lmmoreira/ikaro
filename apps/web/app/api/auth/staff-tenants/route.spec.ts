import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const BFF_URL = 'http://bff-test:3002';

function makeRequest(token?: string): NextRequest {
  const url = new URL('http://localhost/api/auth/staff-tenants');
  if (token) url.searchParams.set('token', token);
  return new NextRequest(url);
}

describe('GET /api/auth/staff-tenants', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_BFF_URL = BFF_URL;
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  it('returns 400 when the token query param is missing', async () => {
    const response = await GET(makeRequest());

    expect(response.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('forwards the token to the BFF and passes through a successful response', async () => {
    const options = [{ staffId: 's-1', tenantId: 't-1' }];
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(options), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const response = await GET(makeRequest('sel-token'));
    const body = await response.json();

    expect(fetchSpy).toHaveBeenCalledWith(`${BFF_URL}/auth/staff-tenants?token=sel-token`, {
      cache: 'no-store',
    });
    expect(response.status).toBe(200);
    expect(body).toEqual(options);
  });

  it('returns a sanitized 502 when the BFF fetch throws', async () => {
    fetchSpy.mockRejectedValue(new Error('connection refused'));

    const response = await GET(makeRequest('sel-token'));
    const body = (await response.json()) as { message: string };

    expect(response.status).toBe(502);
    expect(body.message).not.toMatch(/connection refused/);
  });
});
