import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { middleware } from './middleware';

// Build a minimal base64url-encoded JWT payload (no real signature — middleware only decodes)
function makeToken(claims: Record<string, unknown>): string {
  const payload = btoa(JSON.stringify(claims))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `header.${payload}.signature`;
}

const validStaffToken = makeToken({
  sub: 'staff-id',
  tenantId: 'tenant-id',
  tenantSlug: 'lavacar-bh',
  tenantName: 'Lavacar BH',
  userName: 'João',
  role: 'STAFF',
  exp: Math.floor(Date.now() / 1000) + 3600,
});

const validManagerToken = makeToken({
  sub: 'manager-id',
  tenantId: 'tenant-id',
  tenantSlug: 'lavacar-bh',
  tenantName: 'Lavacar BH',
  userName: 'Maria',
  role: 'MANAGER',
  exp: Math.floor(Date.now() / 1000) + 3600,
});

const expiredStaffToken = makeToken({
  sub: 'staff-id',
  tenantId: 'tenant-id',
  tenantSlug: 'lavacar-bh',
  tenantName: 'Lavacar BH',
  userName: 'João',
  role: 'STAFF',
  exp: Math.floor(Date.now() / 1000) - 60,
});

const customerToken = makeToken({
  sub: 'customer-id',
  tenantId: 'tenant-id',
  tenantSlug: 'lavacar-bh',
  tenantName: 'Lavacar BH',
  userName: 'Ana',
  role: 'CUSTOMER',
  exp: Math.floor(Date.now() / 1000) + 3600,
});

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

  it('passes through a protected dashboard route with a valid STAFF token', () => {
    const response = middleware(makeRequest('/dashboard/bookings', validStaffToken));

    expect(response.status).not.toBe(307);
    expect(response.headers.get('location')).toBeNull();
  });

  it('passes through a protected dashboard route with a valid MANAGER token', () => {
    const response = middleware(makeRequest('/dashboard/bookings', validManagerToken));

    expect(response.status).not.toBe(307);
    expect(response.headers.get('location')).toBeNull();
  });

  it('redirects when the token has CUSTOMER role (customers cannot access dashboard)', () => {
    const response = middleware(makeRequest('/dashboard/bookings', customerToken));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/dashboard/login');
  });

  it('redirects when the token is expired', () => {
    const response = middleware(makeRequest('/dashboard/bookings', expiredStaffToken));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/dashboard/login');
  });

  it('redirects when the token is a malformed string (not a JWT)', () => {
    const response = middleware(makeRequest('/dashboard/bookings', 'not-a-jwt'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/dashboard/login');
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

  // ── Customer area guard (/[slug]/my-account/**) ───────────────────────────

  it('redirects to /{slug}/login when visiting my-account without a token', () => {
    const response = middleware(makeRequest('/lavacar-bh/my-account'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/lavacar-bh/login');
  });

  it('redirects to /{slug}/login when visiting a nested my-account route without a token', () => {
    const response = middleware(makeRequest('/lavacar-bh/my-account/bookings'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/lavacar-bh/login');
  });

  it('passes through my-account with a valid CUSTOMER token matching the slug', () => {
    const response = middleware(makeRequest('/lavacar-bh/my-account', customerToken));

    expect(response.status).not.toBe(307);
    expect(response.headers.get('location')).toBeNull();
  });

  it('redirects when the CUSTOMER token tenantSlug does not match the URL slug', () => {
    const otherSlugToken = makeToken({
      sub: 'customer-id',
      tenantId: 'other-id',
      tenantSlug: 'another-tenant',
      role: 'CUSTOMER',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const response = middleware(makeRequest('/lavacar-bh/my-account', otherSlugToken));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/lavacar-bh/login');
  });

  it('redirects when a STAFF token is used on my-account (staff must not reach customer area)', () => {
    const response = middleware(makeRequest('/lavacar-bh/my-account', validStaffToken));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/lavacar-bh/login');
  });

  it('redirects when a MANAGER token is used on my-account', () => {
    const response = middleware(makeRequest('/lavacar-bh/my-account', validManagerToken));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/lavacar-bh/login');
  });

  it('redirects when the CUSTOMER token is expired', () => {
    const expiredCustomerToken = makeToken({
      sub: 'customer-id',
      tenantId: 'tenant-id',
      tenantSlug: 'lavacar-bh',
      role: 'CUSTOMER',
      exp: Math.floor(Date.now() / 1000) - 60,
    });
    const response = middleware(makeRequest('/lavacar-bh/my-account', expiredCustomerToken));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/lavacar-bh/login');
  });
});
