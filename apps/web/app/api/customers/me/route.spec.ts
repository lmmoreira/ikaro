import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockCookieGet = vi.fn();

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockImplementation(() => ({ get: mockCookieGet })),
}));

import { GET } from './route';

const BFF_URL = 'http://bff-test:3002';

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

    const response = await GET();

    expect(response.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('forwards the access_token cookie to the BFF and passes through a successful response', async () => {
    mockCookieGet.mockReturnValue({ value: 'signed-jwt' });
    const profile = { customerId: 'c-1', email: 'joao@example.com', name: 'João Silva' };
    fetchSpy.mockResolvedValue(new Response(JSON.stringify(profile), { status: 200 }));

    const response = await GET();
    const body = await response.json();

    expect(fetchSpy).toHaveBeenCalledWith(`${BFF_URL}/customers/me`, {
      headers: { Cookie: 'access_token=signed-jwt' },
      cache: 'no-store',
    });
    expect(response.status).toBe(200);
    expect(body).toEqual(profile);
  });

  it('passes through the BFF status code when the token is rejected', async () => {
    mockCookieGet.mockReturnValue({ value: 'expired-jwt' });
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 }),
    );

    const response = await GET();

    expect(response.status).toBe(401);
  });
});
