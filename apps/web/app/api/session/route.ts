import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { bffServerFetch } from '@/shared/lib/api/bff-server';
import { SESSION_COOKIE_NAME } from '@/features/auth/session-cookie';

// Thin same-origin proxy — same shape as /api/staff/me and /api/customers/me. The
// staff-vs-customer branching (which single BFF lookup to make, how to shape the combined
// { staff, customer } result) lives in the BFF's GET /auth/session, not here: it's orchestration,
// and the BFF already knows the actor's role from the JWT (via its guard chain) without guessing.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const slug = request.nextUrl.searchParams.get('slug');

  try {
    const res = await bffServerFetch(token, '/auth/session', {
      headers: slug ? { 'X-Tenant-Slug': slug } : undefined,
    });

    const contentType = res.headers.get('content-type') ?? '';
    const body =
      contentType.includes('application/json') || contentType.includes('+json')
        ? await res.json()
        : { message: 'Upstream error' };

    return NextResponse.json(body, { status: res.status });
  } catch {
    return NextResponse.json({ message: 'Upstream unavailable' }, { status: 502 });
  }
}
