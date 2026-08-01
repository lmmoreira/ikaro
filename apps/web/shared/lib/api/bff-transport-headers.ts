import 'server-only';
import { getClientIp } from '@ikaro/http-utils';
import { getBffAuthorizationHeader } from '@/shared/lib/auth/google-identity-token';
import { getBffAudience, getBffAuthMode } from './bff-auth';
import { getBffUpstreamUrl } from './bff-url';

// TD38: every server-side call to BFF -- whether through the same-origin gateway
// (apps/web/app/v1/[...path]/route.ts) or directly via bffServerFetch/bffPublicFetch
// (bff-server.ts) -- must carry the same two things now that BFF only ever accepts calls
// from ikaro-web: a Cloud Run IAM ID token (when required) and the X-Web-Internal-Key
// defense-in-depth shared secret (always required, mirrors INTERNAL_API_KEY's existing
// bff<->backend pattern exactly -- no auth-mode gate on this one).
export async function attachBffAuthHeaders(headers: Headers): Promise<void> {
  const webInternalKey = process.env.WEB_INTERNAL_KEY;
  if (!webInternalKey) {
    throw new Error('WEB_INTERNAL_KEY is required for every BFF server call (TD38)');
  }
  headers.set('x-web-internal-key', webInternalKey);

  if (getBffAuthMode() === 'iam') {
    const audience = getBffAudience() ?? new URL(getBffUpstreamUrl()).origin;
    headers.set('authorization', await getBffAuthorizationHeader(audience));
  }
}

// Resolves the real client IP from the headers of the original, genuinely trustworthy
// browser->web hop (single real proxy layer: GFE direct in staging, Cloudflare in prod) --
// BFF no longer re-derives this itself; it trusts whatever ikaro-web forwards.
export function resolveClientIp(
  sourceHeaders: Record<string, string | string[] | undefined>,
): string {
  const appEnv = process.env.APP_ENV ?? 'local';
  return getClientIp({ headers: sourceHeaders }, appEnv);
}
