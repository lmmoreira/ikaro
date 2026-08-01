// TD38: BFF is now only ever reachable from ikaro-web's same-origin gateway (Cloud Run ingress
// lockdown + IAM ID token + shared-secret guard — see web-only.guard.ts). There is nothing left
// to guess: ikaro-web already resolved the real client IP on the genuinely trustworthy
// browser->web hop and forwards it as X-Real-Client-Ip. Trust it directly instead of
// re-deriving from raw proxy headers (the old CF-Connecting-IP/rightmost-XFF branching, which
// never saw the real browser IP to begin with once every real caller went through the gateway —
// see td/TD38-BFF-CLIENT-IP-RESOLUTION-BROKEN-BY-SAME-ORIGIN-GATEWAY.md for the full history).
import { ClientIpRequest, getTrustedClientIp } from '@ikaro/http-utils';

export type { ClientIpRequest };

export function getClientIp(req: ClientIpRequest): string {
  return getTrustedClientIp(req, 'x-real-client-ip');
}
