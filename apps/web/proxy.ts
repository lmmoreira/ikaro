import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyCustomerToken, verifyStaffToken } from '@/features/auth/verify-edge-jwt';
import { getPublicEnv } from '@/shared/lib/runtime-env/public-env';
import { SESSION_COOKIE_NAME } from '@/features/auth/session-cookie';

// Shared manager-only route list for /dashboard — M13-S31/S32 own this single edit;
// M13-S35 (hotsite editor) reuses it. STAFF hitting these is sent back to the dashboard home.
const MANAGER_ONLY_ROUTES = ['/dashboard/settings', '/dashboard/team', '/dashboard/hotsite'];

function isManagerOnlyRoute(pathname: string): boolean {
  return MANAGER_ONLY_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

// Matches /<slug>/my-account and /<slug>/my-account/* — captures the slug.
const MY_ACCOUNT_PATTERN = /^\/([^/]+)\/my-account(?:\/.*)?$/;

// Top-level app routes that are NOT part of the tenant `/[slug]` catch-all tree.
// Everything else (hotsite home, /booking, /login, /my-account) shares one relaxed
// script-src/frame-src policy below; these stay on the strict baseline.
const RESERVED_TOP_SEGMENTS = new Set([
  'dashboard',
  'auth',
  'select-staff-tenant',
  'switch-tenant',
]);

function isHotsiteRoute(pathname: string): boolean {
  if (pathname === '/') return false;
  const firstSegment = pathname.split('/')[1] ?? '';
  return !RESERVED_TOP_SEGMENTS.has(firstSegment);
}

// /dashboard/hotsite's "Preview" view renders the real ContactModule component tree — the same
// one the public hotsite uses, HotsitePreview.tsx imports it directly — inside the dashboard,
// Google Maps iframe included whenever the Contact module is enabled. It needs the same
// frame-src Maps allowance the public hotsite route gets below, even though /dashboard is
// otherwise excluded from isHotsiteRoute() (M18-S07 follow-up: hotsite preview blocked the map).
const HOTSITE_EDITOR_ROUTE = '/dashboard/hotsite';

function needsMapsFrameSrc(pathname: string): boolean {
  return (
    isHotsiteRoute(pathname) ||
    pathname === HOTSITE_EDITOR_ROUTE ||
    pathname.startsWith(`${HOTSITE_EDITOR_ROUTE}/`)
  );
}

// Cloudflare Turnstile (M20-S09) loads its script from and renders its challenge inside an
// iframe from challenges.cloudflare.com — without both script-src and frame-src allowing that
// origin, the widget silently never renders (no console error visible to a casual check; caught
// only by a real-browser Playwright run, PR #433 review round 2). Originally scoped to
// /[slug]/lead-form only, which was itself a bug (M20-S15): CSP is a document-response header
// the browser only re-reads on a fresh top-level navigation, never on a Next.js client-side
// (next/link) transition — a guest who soft-navigates from the hotsite home page into
// /lead-form keeps enforcing the home page's (Turnstile-less) CSP, so the widget silently never
// renders. Scoped to the whole hotsite route tree instead, mirroring needsMapsFrameSrc's own
// tree-wide scoping just above, so whichever hotsite page a guest's browser actually loaded
// fresh already carries a CSP that permits Turnstile.
function needsTurnstileSrc(pathname: string): boolean {
  return isHotsiteRoute(pathname);
}

// scheme+host+port only — CSP source expressions don't need (or want) the path.
function originOf(rawUrl: string | undefined): string | null {
  if (!rawUrl) return null;
  try {
    return new URL(rawUrl).origin;
  } catch {
    return null;
  }
}

// script-src can't go nonce-only: Next.js injects its own inline hydration/RSC-payload
// <script> tags into every server-rendered page (not just JsonLdScript.tsx on the hotsite),
// and a nonce only matches on responses generated fresh per request. Most routes here aren't
// guaranteed dynamic (no cookies()/headers() call in every dashboard/auth page tree), and the
// hotsite home page is deliberately ISR/CDN-cached (docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md) —
// so a nonce would either go stale against cached HTML or require auditing every route's
// rendering mode. 'unsafe-inline' on script-src is a blanket, verified-working baseline instead.
// The Maps embed URL (ContactModule.tsx) requests https://maps.google.com/maps?...&output=embed,
// which 302-redirects to https://www.google.com/maps/embed?... — CSP frame-src is checked
// against every hop of a navigation/redirect chain, so both origins must be allowed or the final
// navigation is silently blocked ("This content is blocked" in the browser).
function buildFrameSrc(allowMapsFrame: boolean, allowTurnstile: boolean): string[] {
  const allowed = [
    allowMapsFrame && 'https://maps.google.com',
    allowMapsFrame && 'https://www.google.com',
    allowTurnstile && 'https://challenges.cloudflare.com',
  ].filter((v): v is string => Boolean(v));
  return allowed.length > 0 ? allowed : ["'none'"];
}

function buildContentSecurityPolicy(pathname: string): string {
  const isDev = process.env.NODE_ENV !== 'production';
  const allowMapsFrame = needsMapsFrameSrc(pathname);
  const allowTurnstile = needsTurnstileSrc(pathname);
  const bffOrigin = originOf(getPublicEnv('NEXT_PUBLIC_BFF_URL'));
  // Public hotsite images and private signed booking-photo URLs are served from the same
  // GCS/S3-compatible backend, so one origin (no path) covers both.
  const storageOrigin = originOf(getPublicEnv('NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL'));

  const scriptSrc = [
    "'self'",
    "'unsafe-inline'",
    isDev && "'unsafe-eval'",
    allowTurnstile && 'https://challenges.cloudflare.com',
  ].filter((v): v is string => Boolean(v));
  const imgSrc = ["'self'", 'blob:', storageOrigin].filter((v): v is string => Boolean(v));
  // Booking/after-service photo uploads PUT directly to a signed storage URL from the browser
  // (PhotoUpload.tsx, AfterServicePhotoUpload.tsx) — connect-src needs the same storage origin
  // img-src already allows, or uploads are silently blocked in production.
  // ViaCEP lookup (viacep-address-lookup.adapter.ts) fetches directly from the browser too —
  // used by both the booking flow and dashboard settings CEP autofill. Without this origin,
  // the browser silently blocks the request and every lookup falls through to "not found".
  const connectSrc = [
    "'self'",
    bffOrigin,
    storageOrigin,
    'https://viacep.com.br',
    allowTurnstile && 'https://challenges.cloudflare.com',
    isDev && 'ws://localhost:*',
  ].filter((v): v is string => Boolean(v));
  const frameSrc = buildFrameSrc(allowMapsFrame, allowTurnstile);

  return [
    `default-src 'self'`,
    `script-src ${scriptSrc.join(' ')}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src ${imgSrc.join(' ')}`,
    `font-src 'self'`,
    `connect-src ${connectSrc.join(' ')}`,
    `frame-src ${frameSrc.join(' ')}`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
  ].join('; ');
}

function applySecurityHeaders(response: NextResponse, pathname: string): NextResponse {
  response.headers.set('Content-Security-Policy', buildContentSecurityPolicy(pathname));
  response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Frame-Options', 'DENY');
  return response;
}

function dashboardLoginUrl(request: NextRequest): URL {
  const loginUrl = new URL('/dashboard/login', request.url);
  const tenantSlug = request.nextUrl.searchParams.get('tenantSlug');
  if (tenantSlug) loginUrl.searchParams.set('tenantSlug', tenantSlug);
  return loginUrl;
}

async function resolveDashboardRedirect(
  request: NextRequest,
  pathname: string,
  token: string | undefined,
): Promise<NextResponse | null> {
  if (!pathname.startsWith('/dashboard') || pathname === '/dashboard/login') return null;

  const staffClaims = token ? await verifyStaffToken(token) : null;
  if (!staffClaims) return NextResponse.redirect(dashboardLoginUrl(request));

  if (isManagerOnlyRoute(pathname) && staffClaims.role !== 'MANAGER') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return null;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  const dashboardRedirect = await resolveDashboardRedirect(request, pathname, token);
  if (dashboardRedirect) return applySecurityHeaders(dashboardRedirect, pathname);

  const myAccountMatch = MY_ACCOUNT_PATTERN.exec(pathname);
  if (myAccountMatch) {
    const slugFromPath = myAccountMatch[1]!;
    const customerClaims = token ? await verifyCustomerToken(token, slugFromPath) : null;
    if (!customerClaims) {
      return applySecurityHeaders(
        NextResponse.redirect(new URL(`/${slugFromPath}/login`, request.url)),
        pathname,
      );
    }
  }

  // Propagate pathname to RSC so i18n/request.ts can resolve the tenant locale
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', pathname);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  return applySecurityHeaders(response, pathname);
}

export const config = {
  // Run on all routes except API handlers, Next.js internals and static files.
  // API routes don't need locale headers — excluding them avoids middleware
  // overhead on route handlers and prevents caching interference.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
