// Resolves the real client IP. Framework-agnostic (no NestJS/Next.js coupling) so both
// apps/web and apps/bff can depend on it without pulling in an unrelated runtime.
//
// TD38 (BFF ingress lockdown + IAM auth from web): BFF is now only ever reachable from
// ikaro-web's same-origin gateway (apps/web/app/v1/[...path]/route.ts). That gateway opens a
// *new* connection from ikaro-web itself, so the raw proxy headers a request arrives with at
// BFF (X-Forwarded-For, CF-Connecting-IP) never carry the real browser IP — they describe
// ikaro-web's own egress hop, not the original request. See
// td/TD38-BFF-CLIENT-IP-RESOLUTION-BROKEN-BY-SAME-ORIGIN-GATEWAY.md for the full root cause.
//
// Two distinct resolution strategies live here, for two different trust boundaries:
//
// - `getClientIp()` — resolves from raw, untrusted proxy headers. Used exactly once, by
//   ikaro-web on the genuinely trustworthy browser->web hop (single real proxy layer: GFE
//   direct in staging, Cloudflare in prod). This is the logic that used to live in
//   apps/bff/src/shared/http/client-ip.ts before TD38 — moved here unchanged, just called from
//   a different place.
// - `getTrustedClientIp()` — a direct, unconditional read of an already-resolved header. Used
//   by BFF once it only ever accepts calls from ikaro-web (TD38 Phases 1-3): there is nothing
//   left to guess, so BFF trusts the value ikaro-web forwarded on the browser->web hop.
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
  return hops.at(-1) || undefined;
}

// prod: CF-Connecting-IP — trustworthy *only* because M17-S36's Cloud Armor origin lockdown
// guarantees traffic entered via Cloudflare (no other path reaches the ALB). Without that
// lockdown this header would be spoofable by anyone hitting the ALB IP directly.
//
// staging (no Cloudflare/ALB, D5): the rightmost X-Forwarded-For hop, verified against real
// Cloud Run traffic in M17-S27 (2026-07-27) once something was actually deployed to test
// against.
//
// local/either env with no proxy headers at all (direct curl, no XFF/CF header present): falls
// back to the raw socket peer — there is no proxy to distrust in that case.
export function getClientIp(req: ClientIpRequest, appEnv: string): string {
  if (appEnv === 'production') {
    return firstHeaderValue(req.headers['cf-connecting-ip']) ?? req.ip ?? 'unknown';
  }
  return rightmostForwardedFor(req) ?? req.ip ?? 'unknown';
}

// BFF-side (TD38 Phase 4): the caller is cryptographically pinned to ikaro-web (IAM ID token +
// shared-secret guard), so the header it forwards is trustworthy by construction — no
// hop-guessing needed. Falls back to the raw socket peer only when the header is genuinely
// absent (e.g. a local dev call with no gateway in front at all).
export function getTrustedClientIp(req: ClientIpRequest, headerName = 'x-real-client-ip'): string {
  return firstHeaderValue(req.headers[headerName]) ?? req.ip ?? 'unknown';
}
