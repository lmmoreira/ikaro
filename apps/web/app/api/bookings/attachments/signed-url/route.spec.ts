import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockCookieGet = vi.fn();

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockImplementation(() => ({ get: mockCookieGet })),
}));

import { POST } from './route';

const BFF_URL = 'http://bff-test:3002';

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/bookings/attachments/signed-url', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/bookings/attachments/signed-url', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_BFF_URL = BFF_URL;
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    mockCookieGet.mockReset();
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('forwards the access token as Authorization and passes through a successful response', async () => {
    mockCookieGet.mockReturnValue({ value: 'signed-jwt' });
    const signedUrl = {
      signedUrl: 'https://storage.example.com/upload?sig=abc',
      filePath: 'tenants/tenant-1/bookings/b-1/photo.jpg',
      expiresAt: '2026-06-15T12:00:00.000Z',
    };
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify(signedUrl), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const response = await POST(
      makeRequest({
        fileName: 'photo.jpg',
        contentType: 'image/jpeg',
        tenantSlug: 'lavacar-beloauto',
        bookingId: 'b-1',
      }),
    );
    const body = await response.json();

    expect(fetchSpy).toHaveBeenCalledWith(`${BFF_URL}/bookings/attachments/signed-url`, {
      headers: {
        Cookie: 'access_token=signed-jwt',
        Authorization: 'Bearer signed-jwt',
        'Content-Type': 'application/json',
      },
      method: 'POST',
      body: JSON.stringify({
        fileName: 'photo.jpg',
        contentType: 'image/jpeg',
        tenantSlug: 'lavacar-beloauto',
        bookingId: 'b-1',
      }),
      cache: 'no-store',
      signal: expect.any(AbortSignal),
    });
    expect(response.status).toBe(201);
    expect(body).toEqual(signedUrl);
  });

  it('forwards guest uploads without Authorization when there is no access token', async () => {
    mockCookieGet.mockReturnValue(undefined);
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ signedUrl: 'https://storage.example.com/upload?sig=abc' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const response = await POST(
      makeRequest({
        fileName: 'photo.jpg',
        contentType: 'image/jpeg',
        tenantSlug: 'lavacar-beloauto',
      }),
    );

    expect(fetchSpy).toHaveBeenCalledWith(`${BFF_URL}/bookings/attachments/signed-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: 'photo.jpg',
        contentType: 'image/jpeg',
        tenantSlug: 'lavacar-beloauto',
      }),
    });
    expect(response.status).toBe(201);
  });

  it('returns 502 when the upstream fetch throws', async () => {
    mockCookieGet.mockReturnValue({ value: 'signed-jwt' });
    fetchSpy.mockRejectedValue(new Error('connection refused'));

    const response = await POST(
      makeRequest({
        fileName: 'photo.jpg',
        contentType: 'image/jpeg',
        tenantSlug: 'lavacar-beloauto',
        bookingId: 'b-1',
      }),
    );

    expect(response.status).toBe(502);
  });
});
