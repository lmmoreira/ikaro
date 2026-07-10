import { NextResponse } from 'next/server';
import { isBffLive } from '@/shared/lib/health/check-bff-liveness';

export async function GET(): Promise<NextResponse> {
  const healthy = await isBffLive();
  return NextResponse.json({ status: healthy ? 'ok' : 'error' }, { status: healthy ? 200 : 503 });
}
