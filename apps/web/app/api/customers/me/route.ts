import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET() {
  const token = (await cookies()).get('access_token')?.value;

  if (!token) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const res = await fetch(`${process.env.NEXT_PUBLIC_BFF_URL}/customers/me`, {
    headers: { Cookie: `access_token=${token}` },
    cache: 'no-store',
  });

  const body = await res.json();
  return NextResponse.json(body, { status: res.status });
}
