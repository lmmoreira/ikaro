import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockCookieGet = vi.fn();
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockImplementation(() => ({ get: mockCookieGet })),
}));

import { GET } from './route';

const BFF_URL = 'http://bff-test:3002';

function makeRequest(search?: string): NextRequest {
  const url = `http://localhost/api/bookings${search ? `?${search}` : ''}`;
  return new NextRequest(url);
}

describe('GET /api/bookings', () => {
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

    const response = await GET(makeRequest());

    expect(response.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('forwards the access_token cookie and passes through a 200 response', async () => {
    mockCookieGet.mockReturnValue({ value: 'signed-jwt' });
    const bookings = { items: [], total: 0, page: 1, limit: 25 };
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(bookings), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(fetchSpy).toHaveBeenCalledWith(
      `${BFF_URL}/bookings`,
      expect.objectContaining({
        headers: expect.objectContaining({ Cookie: 'access_token=signed-jwt' }),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(response.status).toBe(200);
    expect(body).toEqual(bookings);
  });

  it('forwards query params to the BFF', async () => {
    mockCookieGet.mockReturnValue({ value: 'signed-jwt' });
    fetchSpy.mockResolvedValue(
      new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
    );

    await GET(makeRequest('status=PENDING%2CINFO_REQUESTED&from=2026-06-26&to=2026-07-09'));

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('status=');
    expect(calledUrl).toContain('from=2026-06-26');
    expect(calledUrl).toContain('to=2026-07-09');
  });

  it('passes through a 4xx status from the BFF', async () => {
    mockCookieGet.mockReturnValue({ value: 'signed-jwt' });
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ message: 'Bad Request' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const response = await GET(makeRequest('status=INVALID'));
    expect(response.status).toBe(400);
  });

  it('returns a generic error body when the BFF responds with non-JSON', async () => {
    mockCookieGet.mockReturnValue({ value: 'signed-jwt' });
    fetchSpy.mockResolvedValue(
      new Response('<html>Bad Gateway</html>', {
        status: 502,
        headers: { 'content-type': 'text/html' },
      }),
    );

    const response = await GET(makeRequest());
    const body = (await response.json()) as { message: string };
    expect(response.status).toBe(502);
    expect(body.message).toBe('Upstream error');
  });

  it('returns 502 when the BFF fetch throws', async () => {
    mockCookieGet.mockReturnValue({ value: 'signed-jwt' });
    fetchSpy.mockRejectedValue(new Error('connection refused'));

    const response = await GET(makeRequest());
    const body = (await response.json()) as { message: string };
    expect(response.status).toBe(502);
    expect(body.message).not.toMatch(/connection refused/);
  });
});
