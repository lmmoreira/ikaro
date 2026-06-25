import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockCookieGet = vi.fn();

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockImplementation(() => ({ get: mockCookieGet })),
}));

import { GET } from './route';

const BFF_URL = 'http://bff-test:3002';

describe('GET /api/auth/staff-tenants', () => {
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

    const response = await GET();

    expect(response.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('forwards the access_token cookie and passes through a successful response', async () => {
    const options = [
      { staffId: 's-1', tenantId: 't-1', tenantSlug: 'bh', tenantName: 'BH', role: 'MANAGER' },
    ];
    mockCookieGet.mockReturnValue({ value: 'signed-jwt' });
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(options), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const response = await GET();
    const body = await response.json();

    expect(fetchSpy).toHaveBeenCalledWith(`${BFF_URL}/auth/staff-tenants`, {
      headers: { Cookie: 'access_token=signed-jwt' },
      cache: 'no-store',
    });
    expect(response.status).toBe(200);
    expect(body).toEqual(options);
  });

  it('returns a sanitized 502 when the BFF fetch throws', async () => {
    mockCookieGet.mockReturnValue({ value: 'signed-jwt' });
    fetchSpy.mockRejectedValue(new Error('connection refused'));

    const response = await GET();
    const body = (await response.json()) as { message: string };

    expect(response.status).toBe(502);
    expect(body.message).not.toMatch(/connection refused/);
  });
});
