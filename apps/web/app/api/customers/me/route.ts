import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = (await cookies()).get('access_token')?.value;

  if (!token) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const slug = request.nextUrl.searchParams.get('slug');

  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BFF_URL}/customers/me`, {
      headers: {
        Cookie: `access_token=${token}`,
        ...(slug ? { 'X-Tenant-Slug': slug } : {}),
      },
      cache: 'no-store',
    });

    const contentType = res.headers.get('content-type') ?? '';
    const body = contentType.includes('application/json')
      ? await res.json()
      : { message: 'Upstream error' };

    return NextResponse.json(body, { status: res.status });
  } catch {
    return NextResponse.json({ message: 'Upstream unavailable' }, { status: 502 });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const token = (await cookies()).get('access_token')?.value;

  if (!token) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const slug = request.nextUrl.searchParams.get('slug');

  try {
    const requestBody = await request.text();
    const res = await fetch(`${process.env.NEXT_PUBLIC_BFF_URL}/customers/me`, {
      method: 'PATCH',
      headers: {
        Cookie: `access_token=${token}`,
        'Content-Type': 'application/json',
        ...(slug ? { 'X-Tenant-Slug': slug } : {}),
      },
      body: requestBody,
      cache: 'no-store',
    });

    const contentType = res.headers.get('content-type') ?? '';
    const body = contentType.includes('application/json')
      ? await res.json()
      : { message: 'Upstream error' };

    return NextResponse.json(body, { status: res.status });
  } catch {
    return NextResponse.json({ message: 'Upstream unavailable' }, { status: 502 });
  }
}
