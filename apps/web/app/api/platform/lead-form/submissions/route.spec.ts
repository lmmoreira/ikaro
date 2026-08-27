import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockCookieGet = vi.fn();

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockImplementation(() => ({ get: mockCookieGet })),
}));

import { POST } from './route';

const BFF_URL = 'http://bff-test:3002';

function makeRequest(slug: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(
    `http://localhost/api/platform/lead-form/submissions?slug=${encodeURIComponent(slug)}`,
    { method: 'POST', body: JSON.stringify(body) },
  );
}

const SUBMISSION_BODY = {
  name: 'Maria Silva',
  email: 'maria@example.com',
  phone: '+5511987654321',
  answers: [{ questionId: 'q1', value: 'Lavagem completa' }],
  turnstileToken: 'test-turnstile-token',
};

describe('POST /api/platform/lead-form/submissions', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_BFF_URL = BFF_URL;
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    mockCookieGet.mockReset();
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('forwards the access token as Authorization for a logged-in customer submission', async () => {
    mockCookieGet.mockReturnValue({ value: 'signed-jwt' });
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ submissionId: 'sub-1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const response = await POST(makeRequest('lavacar-beloauto', SUBMISSION_BODY));
    const body = await response.json();

    expect(fetchSpy).toHaveBeenCalledWith(
      `${BFF_URL}/public/platform/lead-form/lavacar-beloauto/submissions`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Cookie: 'access_token=signed-jwt',
          Authorization: 'Bearer signed-jwt',
          'Content-Type': 'application/json',
          'X-Tenant-Slug': 'lavacar-beloauto',
        }),
        body: JSON.stringify(SUBMISSION_BODY),
      }),
    );
    expect(response.status).toBe(200);
    expect(body).toEqual({ submissionId: 'sub-1' });
  });

  it('forwards a guest submission without Authorization when there is no access token', async () => {
    mockCookieGet.mockReturnValue(undefined);
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ submissionId: 'sub-2' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const response = await POST(makeRequest('lavacar-beloauto', SUBMISSION_BODY));

    expect(fetchSpy).toHaveBeenCalledWith(
      `${BFF_URL}/public/platform/lead-form/lavacar-beloauto/submissions`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-Tenant-Slug': 'lavacar-beloauto',
        }),
        body: JSON.stringify(SUBMISSION_BODY),
      }),
    );
    const headers = fetchSpy.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers['Authorization']).toBeUndefined();
    expect(response.status).toBe(200);
  });

  it('returns 400 without calling the BFF when the slug query param is missing', async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }));

    const response = await POST(
      new NextRequest('http://localhost/api/platform/lead-form/submissions', {
        method: 'POST',
        body: JSON.stringify(SUBMISSION_BODY),
      }),
    );

    expect(response.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns 502 when the upstream fetch throws', async () => {
    mockCookieGet.mockReturnValue(undefined);
    fetchSpy.mockRejectedValue(new Error('connection refused'));

    const response = await POST(makeRequest('lavacar-beloauto', SUBMISSION_BODY));

    expect(response.status).toBe(502);
  });

  it('returns 413 without calling the BFF when the actual body exceeds the byte cap', async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }));
    const oversizedBody = JSON.stringify({ ...SUBMISSION_BODY, name: 'x'.repeat(64 * 1024 + 1) });

    const response = await POST(
      new NextRequest('http://localhost/api/platform/lead-form/submissions?slug=lavacar-beloauto', {
        method: 'POST',
        body: oversizedBody,
      }),
    );

    expect(response.status).toBe(413);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // The limit is enforced by counting real bytes read from the stream, not by trusting the
  // Content-Length header — this proves it still holds with no header at all, the exact gap a
  // Content-Length-only check would miss (Codex finding, PR #433 round 11).
  it('enforces the byte cap even when Content-Length is absent (e.g. chunked transfer)', async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }));
    const oversizedBody = JSON.stringify({ ...SUBMISSION_BODY, name: 'x'.repeat(64 * 1024 + 1) });
    const request = new NextRequest(
      'http://localhost/api/platform/lead-form/submissions?slug=lavacar-beloauto',
      { method: 'POST', body: oversizedBody },
    );
    expect(request.headers.get('content-length')).toBeNull();

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('passes through a non-2xx BFF response (e.g. rate limited)', async () => {
    mockCookieGet.mockReturnValue(undefined);
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ code: 'PLATFORM_LEAD_FORM_DAILY_CAP_REACHED' }), {
        status: 429,
        headers: { 'content-type': 'application/problem+json' },
      }),
    );

    const response = await POST(makeRequest('lavacar-beloauto', SUBMISSION_BODY));
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body).toEqual({ code: 'PLATFORM_LEAD_FORM_DAILY_CAP_REACHED' });
  });
});
