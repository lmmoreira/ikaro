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

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('access_token')?.value;

  if (pathname.startsWith('/dashboard') && pathname !== '/dashboard/login') {
    if (!token || !isValidStaffToken(token)) {
      return NextResponse.redirect(new URL('/dashboard/login', request.url));
    }
  }

  const myAccountMatch = MY_ACCOUNT_PATTERN.exec(pathname);
  if (myAccountMatch) {
    const slugFromPath = myAccountMatch[1]!;
    if (!token || !isValidCustomerToken(token, slugFromPath)) {
      return NextResponse.redirect(new URL(`/${slugFromPath}/login`, request.url));
    }
  }

  // Propagate pathname to RSC so i18n/request.ts can resolve the tenant locale
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  // Run on all routes except API handlers, Next.js internals and static files.
  // API routes don't need locale headers — excluding them avoids middleware
  // overhead on route handlers and prevents caching interference.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
