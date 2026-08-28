import { NextRequest } from 'next/server';
import { SignJWT } from 'jose';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { proxy } from './proxy';

// Matches the backend/BFF's real minimum length (env.validation.ts requires >=64 chars) so this
// suite exercises the same HS256 key-length shape as production, not a toy secret.
const TEST_SECRET = 'test-jwt-secret-64-chars-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
const FORGED_SECRET = 'a-different-attacker-controlled-secret-that-does-not-match-64c';

// Mints a real HS256-signed token against TEST_SECRET (which proxy.ts's JWT_SECRET is set
// to below) — this suite must verify actual signature checking, not just claim decoding (TD15).
async function makeToken(claims: Record<string, unknown> & { exp?: number }): Promise<string> {
  const builder = new SignJWT(claims).setProtectedHeader({ alg: 'HS256' });
  if (claims.exp !== undefined) {
    builder.setExpirationTime(claims.exp);
  }
  return builder.sign(new TextEncoder().encode(TEST_SECRET));
}

// Mints a structurally-valid, well-formed token signed with a DIFFERENT secret — simulates the
// exact TD15 attack: a forged access_token cookie with plausible claims but no valid signature.
async function makeForgedToken(
  claims: Record<string, unknown> & { exp?: number },
): Promise<string> {
  const builder = new SignJWT(claims).setProtectedHeader({ alg: 'HS256' });
  if (claims.exp !== undefined) {
    builder.setExpirationTime(claims.exp);
  }
  return builder.sign(new TextEncoder().encode(FORGED_SECRET));
}

function makeRequest(path: string, token?: string): NextRequest {
  const init = token ? { headers: { cookie: `access_token=${token}` } } : {};
  return new NextRequest(new URL(path, 'http://localhost:3000'), init);
}

let validStaffToken: string;
let validManagerToken: string;
let expiredStaffToken: string;
let customerToken: string;

beforeAll(async () => {
  process.env.JWT_SECRET = TEST_SECRET;

  validStaffToken = await makeToken({
    sub: 'staff-id',
    tenantId: 'tenant-id',
    tenantSlug: 'lavacar-bh',
    tenantName: 'Lavacar BH',
    userName: 'João',
    role: 'STAFF',
    exp: Math.floor(Date.now() / 1000) + 3600,
  });

  validManagerToken = await makeToken({
    sub: 'manager-id',
    tenantId: 'tenant-id',
    tenantSlug: 'lavacar-bh',
    tenantName: 'Lavacar BH',
    userName: 'Maria',
    role: 'MANAGER',
    exp: Math.floor(Date.now() / 1000) + 3600,
  });

  expiredStaffToken = await makeToken({
    sub: 'staff-id',
    tenantId: 'tenant-id',
    tenantSlug: 'lavacar-bh',
    tenantName: 'Lavacar BH',
    userName: 'João',
    role: 'STAFF',
    exp: Math.floor(Date.now() / 1000) - 60,
  });

  customerToken = await makeToken({
    sub: 'customer-id',
    tenantId: 'tenant-id',
    tenantSlug: 'lavacar-bh',
    tenantName: 'Lavacar BH',
    userName: 'Ana',
    role: 'CUSTOMER',
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
});

describe('proxy', () => {
  it.each([
    ['the dashboard area', '/dashboard/bookings', 'http://localhost:3000/dashboard/login'],
    [
      'the customer account area',
      '/lavacar-bh/my-account',
      'http://localhost:3000/lavacar-bh/login',
    ],
    [
      'a nested customer account route',
      '/lavacar-bh/my-account/bookings',
      'http://localhost:3000/lavacar-bh/login',
    ],
  ])(
    'redirects to the login page when visiting %s without a token',
    async (_label, path, expectedLocation) => {
      const response = await proxy(makeRequest(path));

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(expectedLocation);
    },
  );

  it('does NOT redirect when visiting /dashboard/login itself without a token (regression: infinite redirect loop)', async () => {
    const response = await proxy(makeRequest('/dashboard/login'));

    expect(response.status).not.toBe(307);
    expect(response.headers.get('location')).toBeNull();
  });

  it('preserves tenantSlug when redirecting an unauthenticated dashboard request', async () => {
    const response = await proxy(makeRequest('/dashboard/bookings?tenantSlug=lavacar-bh'));

    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/dashboard/login?tenantSlug=lavacar-bh',
    );
  });

  it('passes through a protected dashboard route with a valid STAFF token', async () => {
    const response = await proxy(makeRequest('/dashboard/bookings', validStaffToken));

    expect(response.status).not.toBe(307);
    expect(response.headers.get('location')).toBeNull();
  });

  it('passes through a protected dashboard route with a valid MANAGER token', async () => {
    const response = await proxy(makeRequest('/dashboard/bookings', validManagerToken));

    expect(response.status).not.toBe(307);
    expect(response.headers.get('location')).toBeNull();
  });

  it('redirects when the token has CUSTOMER role (customers cannot access dashboard)', async () => {
    const response = await proxy(makeRequest('/dashboard/bookings', customerToken));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/dashboard/login');
  });

  it('redirects when the token is expired', async () => {
    const response = await proxy(makeRequest('/dashboard/bookings', expiredStaffToken));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/dashboard/login');
  });

  it('redirects when the token is a malformed string (not a JWT)', async () => {
    const response = await proxy(makeRequest('/dashboard/bookings', 'not-a-jwt'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/dashboard/login');
  });

  it('redirects when the STAFF token has no exp claim', async () => {
    const noExpStaffToken = await makeToken({ sub: 'staff-id', role: 'STAFF' });
    const response = await proxy(makeRequest('/dashboard/bookings', noExpStaffToken));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/dashboard/login');
  });

  // ── TD15 regression: forged cookie with plausible claims but no valid signature ────────────

  it('redirects when a dashboard token has valid shape/claims but a forged signature (TD15)', async () => {
    const forgedManagerToken = await makeForgedToken({
      sub: 'attacker-id',
      role: 'MANAGER',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const response = await proxy(makeRequest('/dashboard/bookings', forgedManagerToken));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/dashboard/login');
  });

  it('passes through a non-dashboard route without a token', async () => {
    const response = await proxy(makeRequest('/lavacar-beloauto'));

    expect(response.status).not.toBe(307);
    expect(response.headers.get('location')).toBeNull();
  });

  it('propagates the pathname as a request header for RSC locale resolution', async () => {
    const response = await proxy(makeRequest('/lavacar-beloauto/booking'));

    expect(response.headers.get('x-middleware-request-x-pathname')).toBe(
      '/lavacar-beloauto/booking',
    );
  });

  // ── Customer area guard (/[slug]/my-account/**) ───────────────────────────
  // (unauthenticated-redirect cases for this guard are covered by the parameterized
  // test above, alongside the dashboard guard's equivalent case)

  it('passes through my-account with a valid CUSTOMER token matching the slug', async () => {
    const response = await proxy(makeRequest('/lavacar-bh/my-account', customerToken));

    expect(response.status).not.toBe(307);
    expect(response.headers.get('location')).toBeNull();
  });

  it('redirects when the CUSTOMER token tenantSlug does not match the URL slug', async () => {
    const otherSlugToken = await makeToken({
      sub: 'customer-id',
      tenantId: 'other-id',
      tenantSlug: 'another-tenant',
      role: 'CUSTOMER',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const response = await proxy(makeRequest('/lavacar-bh/my-account', otherSlugToken));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/lavacar-bh/login');
  });

  it('redirects when a STAFF token is used on my-account (staff must not reach customer area)', async () => {
    const response = await proxy(makeRequest('/lavacar-bh/my-account', validStaffToken));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/lavacar-bh/login');
  });

  it('redirects when a MANAGER token is used on my-account', async () => {
    const response = await proxy(makeRequest('/lavacar-bh/my-account', validManagerToken));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/lavacar-bh/login');
  });

  it('redirects when the CUSTOMER token is expired', async () => {
    const expiredCustomerToken = await makeToken({
      sub: 'customer-id',
      tenantId: 'tenant-id',
      tenantSlug: 'lavacar-bh',
      role: 'CUSTOMER',
      exp: Math.floor(Date.now() / 1000) - 60,
    });
    const response = await proxy(makeRequest('/lavacar-bh/my-account', expiredCustomerToken));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/lavacar-bh/login');
  });

  it('redirects when the CUSTOMER token has no exp claim', async () => {
    const noExpCustomerToken = await makeToken({
      sub: 'customer-id',
      tenantSlug: 'lavacar-bh',
      role: 'CUSTOMER',
    });
    const response = await proxy(makeRequest('/lavacar-bh/my-account', noExpCustomerToken));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/lavacar-bh/login');
  });

  it('redirects when a my-account token has valid shape/claims but a forged signature (TD15)', async () => {
    const forgedCustomerToken = await makeForgedToken({
      sub: 'attacker-id',
      role: 'CUSTOMER',
      tenantSlug: 'lavacar-bh',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const response = await proxy(makeRequest('/lavacar-bh/my-account', forgedCustomerToken));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/lavacar-bh/login');
  });

  // ── Security headers ──────────────────────────────────────────────────────

  describe('security headers', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('sets baseline security headers on every response, including redirects', async () => {
      const response = await proxy(makeRequest('/dashboard/bookings'));

      expect(response.headers.get('Strict-Transport-Security')).toBe(
        'max-age=63072000; includeSubDomains; preload',
      );
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
      expect(response.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    });

    it('allows inline scripts (Next.js hydration payload) on every route, but does not relax frame-src for dashboard', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      const response = await proxy(makeRequest('/dashboard/bookings', validStaffToken));
      const csp = response.headers.get('Content-Security-Policy') ?? '';

      expect(csp).toContain("script-src 'self' 'unsafe-inline'");
      expect(csp).toContain("frame-src 'none'");
    });

    it('does not relax frame-src for the root path', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      const response = await proxy(makeRequest('/'));
      const csp = response.headers.get('Content-Security-Policy') ?? '';

      expect(csp).toContain("script-src 'self' 'unsafe-inline'");
      expect(csp).toContain("frame-src 'none'");
    });

    it('allows the inline JSON-LD script and the Google Maps embed on hotsite routes', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      const response = await proxy(makeRequest('/lavacar-beloauto'));
      const csp = response.headers.get('Content-Security-Policy') ?? '';

      expect(csp).toContain("script-src 'self' 'unsafe-inline'");
      expect(csp).toContain('https://maps.google.com');
      expect(csp).toContain('https://www.google.com');
    });

    it('extends the Maps frame-src relaxation to booking, login, and my-account sub-routes', async () => {
      vi.stubEnv('NODE_ENV', 'production');

      for (const path of [
        '/lavacar-beloauto/booking',
        '/lavacar-beloauto/login',
        '/lavacar-beloauto/my-account',
      ]) {
        const response = await proxy(makeRequest(path));
        const csp = response.headers.get('Content-Security-Policy') ?? '';
        expect(csp).toContain('https://maps.google.com');
        expect(csp).toContain('https://www.google.com');
      }
    });

    // M18-S07 follow-up: /dashboard/hotsite's "Preview" view renders the real ContactModule
    // component tree (HotsitePreview.tsx imports it directly, same component the public hotsite
    // uses), Google Maps iframe included — it was silently blocked because /dashboard is
    // otherwise excluded from the hotsite-route frame-src relaxation above.
    it('also relaxes frame-src for /dashboard/hotsite (the Preview view embeds the same Maps iframe)', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      const response = await proxy(makeRequest('/dashboard/hotsite', validManagerToken));
      const csp = response.headers.get('Content-Security-Policy') ?? '';

      // The exact directive, not just a substring match elsewhere in the header (CodeRabbit
      // review, PR #329) — a future change that placed these origins in another directive while
      // frame-src stayed 'none' would still pass a bare toContain(origin) check.
      expect(csp).toContain(
        'frame-src https://maps.google.com https://www.google.com; frame-ancestors',
      );
    });

    // needsMapsFrameSrc() matches the editor route by prefix (pathname === HOTSITE_EDITOR_ROUTE ||
    // startsWith(`${HOTSITE_EDITOR_ROUTE}/`)) — verifies both that a genuine nested route also gets
    // the relaxation and that a merely similarly-named route doesn't false-positive on it
    // (CodeRabbit review, PR #329).
    it('relaxes frame-src for a nested /dashboard/hotsite/* route too, but not a route that only shares the prefix as text', async () => {
      vi.stubEnv('NODE_ENV', 'production');

      const nested = await proxy(makeRequest('/dashboard/hotsite/edit', validManagerToken));
      expect(nested.headers.get('Content-Security-Policy') ?? '').toContain(
        'frame-src https://maps.google.com https://www.google.com; frame-ancestors',
      );

      const nearMiss = await proxy(makeRequest('/dashboard/hotsite-preview', validManagerToken));
      expect(nearMiss.headers.get('Content-Security-Policy') ?? '').toContain(
        "frame-src 'none'; frame-ancestors",
      );
    });

    // Turnstile loads its script from and renders its challenge inside an iframe from
    // challenges.cloudflare.com — without both allowances the widget silently never renders (PR
    // #433 review round 2: this exact gap made the real Playwright E2E run's Turnstile iframe
    // never appear, even though nothing else in the request/response chain was broken).
    it('allows Cloudflare Turnstile on the /[slug]/lead-form route', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      const response = await proxy(makeRequest('/lavacar-beloauto/lead-form'));
      const csp = response.headers.get('Content-Security-Policy') ?? '';

      expect(csp).toContain("script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com");
      expect(csp).toContain(
        "connect-src 'self' https://viacep.com.br https://challenges.cloudflare.com",
      );
      // /[slug]/lead-form is also a hotsite route, so it keeps the Maps frame-src allowance
      // alongside Turnstile's — this asserts the exact directive (not a bare substring match
      // elsewhere in the header) contains both origins together.
      expect(csp).toContain(
        'frame-src https://maps.google.com https://www.google.com https://challenges.cloudflare.com; frame-ancestors',
      );
    });

    // Widened in M20-S15: CSP is a document-response header the browser only re-reads on a
    // fresh top-level navigation, never on a Next.js client-side (next/link) transition — a
    // guest who soft-navigates from the hotsite home page into /lead-form was stuck enforcing
    // whichever CSP the home page itself carried. Allowing Turnstile tree-wide (mirroring
    // needsMapsFrameSrc's own scoping) guarantees whichever hotsite page loaded fresh already
    // permits it, regardless of which page the guest then soft-navigates to.
    it('also allows Cloudflare Turnstile on other hotsite routes, not just /lead-form', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      const response = await proxy(makeRequest('/lavacar-beloauto/booking'));
      const csp = response.headers.get('Content-Security-Policy') ?? '';

      expect(csp).toContain("script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com");
      expect(csp).toContain(
        "connect-src 'self' https://viacep.com.br https://challenges.cloudflare.com",
      );
      expect(csp).toContain(
        'frame-src https://maps.google.com https://www.google.com https://challenges.cloudflare.com; frame-ancestors',
      );
    });

    it('does not allow Cloudflare Turnstile on /dashboard or /auth routes', async () => {
      vi.stubEnv('NODE_ENV', 'production');

      const dashboard = await proxy(makeRequest('/dashboard/settings', validManagerToken));
      expect(dashboard.headers.get('Content-Security-Policy') ?? '').not.toContain(
        'challenges.cloudflare.com',
      );

      const auth = await proxy(makeRequest('/auth/callback'));
      expect(auth.headers.get('Content-Security-Policy') ?? '').not.toContain(
        'challenges.cloudflare.com',
      );
    });

    it('does not relax frame-src for other /dashboard routes', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      const response = await proxy(makeRequest('/dashboard/settings', validManagerToken));
      const csp = response.headers.get('Content-Security-Policy') ?? '';

      expect(csp).toContain("frame-src 'none'; frame-ancestors");
    });

    it('allows the configured BFF origin and storage origin in connect-src (direct-to-storage photo uploads PUT from the browser)', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('NEXT_PUBLIC_BFF_URL', 'https://bff.ikaro.example/v1');
      vi.stubEnv(
        'NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL',
        'https://storage.googleapis.com/ikaro-bucket',
      );

      const response = await proxy(makeRequest('/lavacar-beloauto'));
      const csp = response.headers.get('Content-Security-Policy') ?? '';

      expect(csp).toContain(
        "connect-src 'self' https://bff.ikaro.example https://storage.googleapis.com https://viacep.com.br",
      );
    });

    it('allows blob: and the configured storage origin in img-src', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv(
        'NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL',
        'https://storage.googleapis.com/ikaro-bucket',
      );

      const response = await proxy(makeRequest('/dashboard/bookings', validStaffToken));
      const csp = response.headers.get('Content-Security-Policy') ?? '';

      expect(csp).toContain("img-src 'self' blob: https://storage.googleapis.com");
    });

    it('falls back to self + viacep-only connect-src, self-only img-src when the env vars are unset', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('NEXT_PUBLIC_BFF_URL', '');
      vi.stubEnv('NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL', '');

      const response = await proxy(makeRequest('/lavacar-beloauto'));
      const csp = response.headers.get('Content-Security-Policy') ?? '';

      // viacep.com.br is a fixed third-party origin (not env-configurable) — always present.
      // challenges.cloudflare.com is also always present on hotsite routes since M20-S15 widened
      // Turnstile's CSP allowance tree-wide — this is the only other origin that can legitimately
      // follow it here now that the BFF/storage origins are unset.
      expect(csp).toContain(
        "connect-src 'self' https://viacep.com.br https://challenges.cloudflare.com",
      );
      expect(csp).not.toMatch(
        /connect-src 'self' https:\/\/viacep\.com\.br https:\/\/challenges\.cloudflare\.com \S/,
      );
      expect(csp).toContain("img-src 'self' blob:");
    });

    it('adds the dev-only unsafe-eval and HMR websocket allowance outside production', async () => {
      vi.stubEnv('NODE_ENV', 'development');

      const response = await proxy(makeRequest('/lavacar-beloauto'));
      const csp = response.headers.get('Content-Security-Policy') ?? '';

      expect(csp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
      expect(csp).toContain('ws://localhost:*');
    });

    it('omits the dev-only allowances in production', async () => {
      vi.stubEnv('NODE_ENV', 'production');

      const response = await proxy(makeRequest('/lavacar-beloauto'));
      const csp = response.headers.get('Content-Security-Policy') ?? '';

      expect(csp).not.toContain('unsafe-eval');
      expect(csp).not.toContain('ws://localhost');
    });
  });
});
