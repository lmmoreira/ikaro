// Resolves the real client IP for rate-limiting keys (M17-S30). The raw socket peer is never
// the client in prod (Cloudflare -> ALB -> Cloud Run) or staging (Cloud Run's own front end).
//
// prod: CF-Connecting-IP — trustworthy *only* because M17-S36's Cloud Armor origin lockdown
// guarantees traffic entered via Cloudflare (no other path reaches the ALB). Without that
// lockdown this header would be spoofable by anyone hitting the ALB IP directly.
//
// staging (no Cloudflare/ALB, D5): the rightmost X-Forwarded-For hop, appended by Cloud Run's
// own front end. The leftmost XFF value is attacker-controlled (a client can send any XFF
// header it likes) and must never be trusted.
//
// local/either env with no proxy headers at all (direct curl, no XFF/CF header present): falls
// back to the raw socket peer — there is no proxy to distrust in that case.
export interface ClientIpRequest {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function rightmostForwardedFor(req: ClientIpRequest): string | undefined {
  const xff = firstHeaderValue(req.headers['x-forwarded-for']);
  if (!xff) return undefined;
  const hops = xff.split(',').map((hop) => hop.trim());
  return hops[hops.length - 1] || undefined;
}

export function getClientIp(req: ClientIpRequest, appEnv: string): string {
  if (appEnv === 'production') {
    return firstHeaderValue(req.headers['cf-connecting-ip']) ?? req.ip ?? 'unknown';
  }
  return rightmostForwardedFor(req) ?? req.ip ?? 'unknown';
}
