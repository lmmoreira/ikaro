import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { bffPublicFetch, bffServerFetch } from '@/shared/lib/api/bff-server';
import { SESSION_COOKIE_NAME } from '@/features/auth/session-cookie';

// The lead-form submission (UC-039/UC-040) optionally carries the logged-in customer's identity
// via Authorization: Bearer <jwt> (docs/14-API_CONTRACTS.md's decodeUserJwt() note) -- the JWT
// lives in an httpOnly cookie, unreadable by client JS, so LeadFormWidget.tsx cannot attach it
// with a direct bffClient call. This mirrors /api/bookings/attachments/signed-url/route.ts's
// exact branch: read the session cookie server-side, forward it as Authorization when present,
// fall back to an anonymous (guest) call otherwise.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const slug = request.nextUrl.searchParams.get('slug');
  const body = await request.text();
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;

  try {
    const upstream = token
      ? await bffServerFetch(token, `/public/platform/lead-form/${slug}/submissions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...(slug ? { 'X-Tenant-Slug': slug } : {}),
          },
          body,
        })
      : await bffPublicFetch(`/public/platform/lead-form/${slug}/submissions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(slug ? { 'X-Tenant-Slug': slug } : {}),
          },
          body,
        });

    const contentType = upstream.headers.get('content-type') ?? '';
    const responseBody =
      contentType.includes('application/json') || contentType.includes('+json')
        ? await upstream.json()
        : { message: 'Upstream error' };

    return NextResponse.json(responseBody, { status: upstream.status });
  } catch {
    return NextResponse.json({ message: 'Upstream unavailable' }, { status: 502 });
  }
}
