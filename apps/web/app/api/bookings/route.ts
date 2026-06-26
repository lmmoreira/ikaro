import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { bffServerFetch } from '@/lib/api/bff-server';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = (await cookies()).get('access_token')?.value;

  if (!token) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const upstream = new URLSearchParams();
  for (const [key, value] of request.nextUrl.searchParams.entries()) {
    upstream.set(key, value);
  }
  const query = upstream.toString();

  try {
    const res = await bffServerFetch(token, `/bookings${query ? `?${query}` : ''}`);

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
