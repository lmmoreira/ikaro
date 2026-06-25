import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const requestBody = await request.text();
    const res = await fetch(`${process.env.NEXT_PUBLIC_BFF_URL}/auth/staff-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
