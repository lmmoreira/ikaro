import { NextResponse } from 'next/server';
import { isBffReady } from '@/shared/lib/health/check-bff-readiness';

export async function GET(): Promise<NextResponse> {
  const healthy = await isBffReady();
  return NextResponse.json({ status: healthy ? 'ok' : 'error' }, { status: healthy ? 200 : 503 });
}
