import { bffPublicFetch } from '../api/bff-server';

const READY_CHECK_TIMEOUT_MS = 2000;

export async function isBffLive(): Promise<boolean> {
  try {
    const res = await bffPublicFetch('/health/live', {
      signal: AbortSignal.timeout(READY_CHECK_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}
