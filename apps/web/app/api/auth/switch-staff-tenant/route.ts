import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const token = (await cookies()).get('access_token')?.value;

  if (!token) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const requestBody = await request.text();
    const res = await fetch(`${process.env.NEXT_PUBLIC_BFF_URL}/auth/switch-staff-tenant`, {
      method: 'POST',
      headers: { Cookie: `access_token=${token}`, 'Content-Type': 'application/json' },
      body: requestBody,
      cache: 'no-store',
    });

    const contentType = res.headers.get('content-type') ?? '';
    const body = contentType.includes('application/json')
      ? await res.json()
      : { message: 'Upstream error' };

    const response = NextResponse.json(body, { status: res.status });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      response.headers.set('set-cookie', setCookie);
    }
    return response;
  } catch {
    return NextResponse.json({ message: 'Upstream unavailable' }, { status: 502 });
  }
}
