import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { bffServerFetch } from '@/shared/lib/api/bff-server';
import { getPublicEnv } from '@/shared/lib/runtime-env/public-env';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as Record<string, unknown>;
  // An explicit guestToken in the body always means this is a guest-flow request (UC-005 A2),
  // even if the browser also carries a leftover access_token cookie from an unrelated session
  // in the same tab (e.g. a staff/admin session). The cookie must never hijack a request that
  // names its own token — that would misattribute the upload to the wrong actor/tenant.
  const token = body.guestToken ? undefined : (await cookies()).get('access_token')?.value;

  try {
    const upstream = token
      ? await bffServerFetch(token, '/bookings/attachments/signed-url', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        })
      : await fetch(`${getPublicEnv('NEXT_PUBLIC_BFF_URL')}/bookings/attachments/signed-url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
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
