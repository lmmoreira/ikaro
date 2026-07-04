import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Edge Runtime — use atob() for base64url decode (Buffer is Node.js-only).
function decodeJwtClaims(token: string): {
  role?: string;
  tenantSlug?: string;
  exp?: number;
} {
  try {
    const payload = token.split('.')[1];
    if (!payload) return {};
    // JWT uses base64url — pad to a multiple of 4 then replace URL-safe chars
    const padded = payload.replaceAll('-', '+').replaceAll('_', '/');
    const json = atob(padded);
    return JSON.parse(json) as { role?: string; tenantSlug?: string; exp?: number };
  } catch {
    return {};
  }
}

function isValidStaffToken(token: string): boolean {
  const claims = decodeJwtClaims(token);
  if (!claims.role) return false;
  if (claims.role !== 'STAFF' && claims.role !== 'MANAGER') return false;
  if (!claims.exp || Date.now() / 1000 > claims.exp) return false;
  return true;
}

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

function isValidCustomerToken(token: string, slugFromPath: string): boolean {
  const claims = decodeJwtClaims(token);
  if (!claims.role) return false;
  if (claims.role !== 'CUSTOMER') return false;
  if (!claims.exp || Date.now() / 1000 > claims.exp) return false;
  if (claims.tenantSlug !== slugFromPath) return false;
  return true;
}

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
function buildContentSecurityPolicy(pathname: string): string {
  const isDev = process.env.NODE_ENV !== 'production';
  const isHotsite = isHotsiteRoute(pathname);
  const bffOrigin = originOf(process.env.NEXT_PUBLIC_BFF_URL);
  // Public hotsite images and private signed booking-photo URLs are served from the same
  // GCS/S3-compatible backend, so one origin (no path) covers both.
  const storageOrigin = originOf(process.env.NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL);

  const scriptSrc = ["'self'", "'unsafe-inline'", isDev && "'unsafe-eval'"].filter(
    (v): v is string => Boolean(v),
  );
  const imgSrc = ["'self'", 'blob:', storageOrigin].filter((v): v is string => Boolean(v));
  // Booking/after-service photo uploads PUT directly to a signed storage URL from the browser
  // (PhotoUpload.tsx, AfterServicePhotoUpload.tsx) — connect-src needs the same storage origin
  // img-src already allows, or uploads are silently blocked in production.
  const connectSrc = ["'self'", bffOrigin, storageOrigin, isDev && 'ws://localhost:*'].filter(
    (v): v is string => Boolean(v),
  );
  const frameSrc = isHotsite ? 'https://maps.google.com' : "'none'";

  return [
    `default-src 'self'`,
    `script-src ${scriptSrc.join(' ')}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src ${imgSrc.join(' ')}`,
    `font-src 'self'`,
    `connect-src ${connectSrc.join(' ')}`,
    `frame-src ${frameSrc}`,
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

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('access_token')?.value;

  if (pathname.startsWith('/dashboard') && pathname !== '/dashboard/login') {
    if (!token || !isValidStaffToken(token)) {
      return applySecurityHeaders(
        NextResponse.redirect(new URL('/dashboard/login', request.url)),
        pathname,
      );
    }
    if (isManagerOnlyRoute(pathname) && decodeJwtClaims(token).role !== 'MANAGER') {
      return applySecurityHeaders(
        NextResponse.redirect(new URL('/dashboard', request.url)),
        pathname,
      );
    }
  }

  const myAccountMatch = MY_ACCOUNT_PATTERN.exec(pathname);
  if (myAccountMatch) {
    const slugFromPath = myAccountMatch[1]!;
    if (!token || !isValidCustomerToken(token, slugFromPath)) {
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
