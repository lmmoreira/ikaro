// Resolves the real client IP for rate-limiting keys (M17-S30). The raw socket peer is never
// the client in prod (Cloudflare -> ALB -> Cloud Run) or staging (Cloud Run's own front end).
//
// prod: CF-Connecting-IP — trustworthy *only* because M17-S36's Cloud Armor origin lockdown
// guarantees traffic entered via Cloudflare (no other path reaches the ALB). Without that
// lockdown this header would be spoofable by anyone hitting the ALB IP directly.
//
// staging (no Cloudflare/ALB, D5): the rightmost X-Forwarded-For hop. The leftmost XFF value
// is attacker-controlled (a client can send any XFF header it likes) and must never be
// trusted — that part is certain. Which position is the actual client IP is NOT verified for
// this exact topology, though: Cloud Run's direct *.run.app path is still GFE-fronted (there is
// no way to reach it without passing through Google's front end), and GCP's own docs describe
// GFE-fronted paths appending more than one hop in some configurations (e.g.
// <existing>,<client-ip>,<lb-ip>,<gfe-ip>,<backend-ip> for the External HTTP(S) LB case) — so
// "rightmost = client" is an assumption, not a confirmed fact, for the no-LB direct-invocation
// case specifically. PR #167 review (2026-07-19) raised this; nothing is deployed yet to test
// against (S18/S27 not landed), so it can't be verified until then. M17-S27's staging
// activation must make a real request from a known IP, inspect the actual header Cloud Run
// delivers, and fix this offset (with a citation to the verified behavior) before relying on
// it for anything beyond the coarse, already-accepted staging risk this session settled on:
// staging's blast radius is bounded by max_instances + billing alerts regardless of this
// value's precision, so an unverified assumption here degrades rate-limit granularity, it does
// not reopen the billing-DoS exposure those other controls already cover.
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
