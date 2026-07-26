import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { bffServerFetch } from '@/shared/lib/api/bff-server';
import { SESSION_COOKIE_NAME } from '@/features/auth/session-cookie';

// Combines /api/staff/me and /api/customers/me into one round trip for callers (HotsiteAuthBar)
// that need both — staff/customer roles are mutually exclusive by construction (BFF's @Roles
// guard rejects the other), so exactly one of the two is ever non-null for a real session.
//
// Unlike /api/staff/me and /api/customers/me (401 without a cookie), a missing cookie here
// returns 200 with both fields null — this endpoint exists specifically to answer "what is the
// current session, if any" for anonymous-tolerant UI, not to gate access to a protected resource.
async function fetchRole(
  token: string,
  path: '/staff/me' | '/customers/me',
  slug: string | null,
): Promise<unknown> {
  try {
    const res = await bffServerFetch(token, path, {
      headers: slug ? { 'X-Tenant-Slug': slug } : undefined,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json({ staff: null, customer: null });
  }

  const slug = request.nextUrl.searchParams.get('slug');

  const [staff, customer] = await Promise.all([
    fetchRole(token, '/staff/me', slug),
    fetchRole(token, '/customers/me', slug),
  ]);

  return NextResponse.json({ staff, customer });
}
