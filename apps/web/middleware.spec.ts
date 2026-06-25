import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { middleware } from './middleware';

function makeRequest(path: string, token?: string): NextRequest {
  const init = token ? { headers: { cookie: `access_token=${token}` } } : {};
  return new NextRequest(new URL(path, 'http://localhost:3000'), init);
}

describe('middleware', () => {
  it('redirects to /dashboard/login when visiting a protected dashboard route without a token', () => {
    const response = middleware(makeRequest('/dashboard/bookings'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/dashboard/login');
  });

  it('does NOT redirect when visiting /dashboard/login itself without a token (regression: infinite redirect loop)', () => {
    const response = middleware(makeRequest('/dashboard/login'));

    expect(response.status).not.toBe(307);
    expect(response.headers.get('location')).toBeNull();
  });

  it('passes through a protected dashboard route when a token is present', () => {
    const response = middleware(makeRequest('/dashboard/bookings', 'signed-jwt'));

    expect(response.status).not.toBe(307);
    expect(response.headers.get('location')).toBeNull();
  });

  it('passes through a non-dashboard route without a token', () => {
    const response = middleware(makeRequest('/lavacar-beloauto'));

    expect(response.status).not.toBe(307);
    expect(response.headers.get('location')).toBeNull();
  });

  it('propagates the pathname as a request header for RSC locale resolution', () => {
    const response = middleware(makeRequest('/lavacar-beloauto/booking'));

    expect(response.headers.get('x-middleware-request-x-pathname')).toBe(
      '/lavacar-beloauto/booking',
    );
  });
});
