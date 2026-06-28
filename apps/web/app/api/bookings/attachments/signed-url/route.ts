import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { bffServerFetch } from '@/lib/api/bff-server';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const token = (await cookies()).get('access_token')?.value;
  const body = (await request.json()) as Record<string, unknown>;

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
      : await fetch(`${process.env.NEXT_PUBLIC_BFF_URL}/bookings/attachments/signed-url`, {
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
