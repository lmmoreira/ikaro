import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = (await cookies()).get('access_token')?.value;

  if (!token) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const upstream = new URL(`${process.env.NEXT_PUBLIC_BFF_URL}/bookings`);

  for (const [key, value] of searchParams.entries()) {
    upstream.searchParams.set(key, value);
  }

  try {
    const res = await fetch(upstream.toString(), {
      headers: { Cookie: `access_token=${token}` },
      cache: 'no-store',
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
