import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { bffServerFetch } from '@/shared/lib/api/bff-server';
import { SESSION_COOKIE_NAME } from '@/features/auth/session-cookie';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const requestBody = await request.text();
    const res = await bffServerFetch(token, '/auth/switch-staff-tenant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: requestBody,
      signal: AbortSignal.timeout(5000),
    });

    const contentType = res.headers.get('content-type') ?? '';
    const body =
      contentType.includes('application/json') || contentType.includes('+json')
        ? await res.json()
        : { message: 'Upstream error' };

    const response = NextResponse.json(body, { status: res.status });
    for (const cookie of res.headers.getSetCookie()) {
      response.headers.append('set-cookie', cookie);
    }
    return response;
  } catch {
    return NextResponse.json({ message: 'Upstream unavailable' }, { status: 502 });
  }
}
