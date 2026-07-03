import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

  it('redirects when the STAFF token has no exp claim', () => {
    const noExpStaffToken = makeToken({ sub: 'staff-id', role: 'STAFF' });
    const response = middleware(makeRequest('/dashboard/bookings', noExpStaffToken));

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

  it('redirects when the CUSTOMER token has no exp claim', () => {
    const noExpCustomerToken = makeToken({
      sub: 'customer-id',
      tenantSlug: 'lavacar-bh',
      role: 'CUSTOMER',
    });
    const response = middleware(makeRequest('/lavacar-bh/my-account', noExpCustomerToken));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/lavacar-bh/login');
  });

  // ── Security headers ──────────────────────────────────────────────────────

  describe('security headers', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('sets baseline security headers on every response, including redirects', () => {
      const response = middleware(makeRequest('/dashboard/bookings'));

      expect(response.headers.get('Strict-Transport-Security')).toBe(
        'max-age=63072000; includeSubDomains; preload',
      );
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
      expect(response.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    });

    it('allows inline scripts (Next.js hydration payload) on every route, but does not relax frame-src for dashboard', () => {
      vi.stubEnv('NODE_ENV', 'production');
      const response = middleware(makeRequest('/dashboard/bookings', validStaffToken));
      const csp = response.headers.get('Content-Security-Policy') ?? '';

      expect(csp).toContain("script-src 'self' 'unsafe-inline'");
      expect(csp).toContain("frame-src 'none'");
    });

    it('does not relax frame-src for the root path', () => {
      vi.stubEnv('NODE_ENV', 'production');
      const response = middleware(makeRequest('/'));
      const csp = response.headers.get('Content-Security-Policy') ?? '';

      expect(csp).toContain("script-src 'self' 'unsafe-inline'");
      expect(csp).toContain("frame-src 'none'");
    });

    it('allows the inline JSON-LD script and the Google Maps embed on hotsite routes', () => {
      vi.stubEnv('NODE_ENV', 'production');
      const response = middleware(makeRequest('/lavacar-beloauto'));
      const csp = response.headers.get('Content-Security-Policy') ?? '';

      expect(csp).toContain("script-src 'self' 'unsafe-inline'");
      expect(csp).toContain('frame-src https://maps.google.com');
    });

    it('extends the Maps frame-src relaxation to booking, login, and my-account sub-routes', () => {
      vi.stubEnv('NODE_ENV', 'production');

      for (const path of [
        '/lavacar-beloauto/booking',
        '/lavacar-beloauto/login',
        '/lavacar-beloauto/my-account',
      ]) {
        const response = middleware(makeRequest(path));
        const csp = response.headers.get('Content-Security-Policy') ?? '';
        expect(csp).toContain('frame-src https://maps.google.com');
      }
    });

    it('allows the configured BFF origin in connect-src', () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('NEXT_PUBLIC_BFF_URL', 'https://bff.ikaro.example/v1');

      const response = middleware(makeRequest('/lavacar-beloauto'));
      const csp = response.headers.get('Content-Security-Policy') ?? '';

      expect(csp).toContain("connect-src 'self' https://bff.ikaro.example");
    });

    it('allows blob: and the configured storage origin in img-src', () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv(
        'NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL',
        'https://storage.googleapis.com/ikaro-bucket',
      );

      const response = middleware(makeRequest('/dashboard/bookings', validStaffToken));
      const csp = response.headers.get('Content-Security-Policy') ?? '';

      expect(csp).toContain("img-src 'self' blob: https://storage.googleapis.com");
    });

    it('falls back to self-only connect-src/img-src when the env vars are unset', () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('NEXT_PUBLIC_BFF_URL', '');
      vi.stubEnv('NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL', '');

      const response = middleware(makeRequest('/lavacar-beloauto'));
      const csp = response.headers.get('Content-Security-Policy') ?? '';

      expect(csp).toContain("connect-src 'self'");
      expect(csp).not.toMatch(/connect-src 'self' \S/);
      expect(csp).toContain("img-src 'self' blob:");
    });

    it('adds the dev-only unsafe-eval and HMR websocket allowance outside production', () => {
      vi.stubEnv('NODE_ENV', 'development');

      const response = middleware(makeRequest('/lavacar-beloauto'));
      const csp = response.headers.get('Content-Security-Policy') ?? '';

      expect(csp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
      expect(csp).toContain('ws://localhost:*');
    });

    it('omits the dev-only allowances in production', () => {
      vi.stubEnv('NODE_ENV', 'production');

      const response = middleware(makeRequest('/lavacar-beloauto'));
      const csp = response.headers.get('Content-Security-Policy') ?? '';

      expect(csp).not.toContain('unsafe-eval');
      expect(csp).not.toContain('ws://localhost');
    });
  });
});
