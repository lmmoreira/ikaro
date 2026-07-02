import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { bffServerFetch } from '@/shared/lib/api/bff-server';

export async function GET(): Promise<NextResponse> {
  const token = (await cookies()).get('access_token')?.value;

  if (!token) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const res = await bffServerFetch(token, '/auth/staff-tenants', {
      signal: AbortSignal.timeout(5000),
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
