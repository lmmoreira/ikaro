import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockCookieGet = vi.fn();

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockImplementation(() => ({ get: mockCookieGet })),
}));

import { GET } from './route';

const BFF_URL = 'http://bff-test:3002';

function makeGetRequest(slug?: string): NextRequest {
  const url = slug ? `http://localhost/api/session?slug=${slug}` : 'http://localhost/api/session';
  return new NextRequest(url);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('GET /api/session', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_BFF_URL = BFF_URL;
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    mockCookieGet.mockReset();
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns { staff: null, customer: null } without calling the BFF when there is no access_token cookie', async () => {
    mockCookieGet.mockReturnValue(undefined);

    const response = await GET(makeGetRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ staff: null, customer: null });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('calls both /staff/me and /customers/me in parallel, forwarding the cookie and slug', async () => {
    mockCookieGet.mockReturnValue({ value: 'signed-jwt' });
    fetchSpy.mockResolvedValue(jsonResponse({}, 401));

    await GET(makeGetRequest('lavacar-beloauto'));

    expect(fetchSpy).toHaveBeenCalledWith(`${BFF_URL}/staff/me`, {
      headers: { Cookie: 'access_token=signed-jwt', 'X-Tenant-Slug': 'lavacar-beloauto' },
      cache: 'no-store',
      signal: expect.any(AbortSignal),
    });
    expect(fetchSpy).toHaveBeenCalledWith(`${BFF_URL}/customers/me`, {
      headers: { Cookie: 'access_token=signed-jwt', 'X-Tenant-Slug': 'lavacar-beloauto' },
      cache: 'no-store',
      signal: expect.any(AbortSignal),
    });
  });

  it('returns the staff body and null customer for an authenticated STAFF session', async () => {
    mockCookieGet.mockReturnValue({ value: 'staff-jwt' });
    const staff = { id: 'staff-1', name: 'Ana Pereira', role: 'STAFF' };
    fetchSpy.mockImplementation(async (url: unknown) => {
      if (String(url).endsWith('/staff/me')) return jsonResponse(staff);
      return jsonResponse({ message: 'Forbidden' }, 403);
    });

    const response = await GET(makeGetRequest('lavacar-beloauto'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ staff, customer: null });
  });

  it('returns the customer body and null staff for an authenticated CUSTOMER session', async () => {
    mockCookieGet.mockReturnValue({ value: 'customer-jwt' });
    const customer = { id: 'customer-1', name: 'João Silva' };
    fetchSpy.mockImplementation(async (url: unknown) => {
      if (String(url).endsWith('/customers/me')) return jsonResponse(customer);
      return jsonResponse({ message: 'Forbidden' }, 403);
    });

    const response = await GET(makeGetRequest('lavacar-beloauto'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ staff: null, customer });
  });

  it('treats a network error on one leg as null for that role, without failing the other', async () => {
    mockCookieGet.mockReturnValue({ value: 'staff-jwt' });
    const staff = { id: 'staff-1', name: 'Ana Pereira', role: 'STAFF' };
    fetchSpy.mockImplementation(async (url: unknown) => {
      if (String(url).endsWith('/staff/me')) return jsonResponse(staff);
      throw new Error('connection refused');
    });

    const response = await GET(makeGetRequest('lavacar-beloauto'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ staff, customer: null });
  });
});
