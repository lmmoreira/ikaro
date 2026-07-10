import { bffPublicFetch } from '../api/bff-server';

const READY_CHECK_TIMEOUT_MS = 2000;

// Checks the BFF's own /health/ready (not /health/live): Cloud Run has no continuous
// readiness-based traffic pulling (only startup + liveness probes), so there's no
// cascading-blast-radius cost to this depth — it just makes this check mean "the BFF
// (and everything beneath it) can actually serve," not merely "the BFF process is up".
export async function isBffReady(): Promise<boolean> {
  try {
    const res = await bffPublicFetch('/health/ready', {
      signal: AbortSignal.timeout(READY_CHECK_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}
