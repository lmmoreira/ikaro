import { jwtVerify } from 'jose';

// Edge Runtime middleware gate for /dashboard/** and /[slug]/my-account/** — unlike
// decode-jwt.ts (display-only, never an authorization boundary), this IS the check that
// decides whether a request is allowed through. Must verify the HS256 signature, not just
// decode claims, or a forged access_token cookie grants access to the dashboard/my-account
// shell (TD15). jose is used because the Edge Runtime has no node:crypto/jsonwebtoken.
export interface StaffClaims {
  readonly role: 'STAFF' | 'MANAGER';
}

export interface CustomerClaims {
  readonly role: 'CUSTOMER';
  readonly tenantSlug: string;
}

let cachedSecret: Uint8Array | undefined;

function getSecret(): Uint8Array {
  if (!cachedSecret) {
    const raw = process.env.JWT_SECRET;
    if (!raw) {
      throw new Error('JWT_SECRET is not set — required to verify the access_token cookie');
    }
    cachedSecret = new TextEncoder().encode(raw);
  }
  return cachedSecret;
}

async function verifySignedClaims(token: string): Promise<Record<string, unknown> | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ['HS256'] });
    // jose only rejects an expired exp — a token with no exp claim at all is treated as
    // non-expiring by default, so the absence must be checked explicitly here.
    if (typeof payload.exp !== 'number') return null;
    return payload;
  } catch {
    return null;
  }
}

export async function verifyStaffToken(token: string): Promise<StaffClaims | null> {
  const claims = await verifySignedClaims(token);
  if (!claims) return null;
  if (claims.role !== 'STAFF' && claims.role !== 'MANAGER') return null;
  return { role: claims.role };
}

export async function verifyCustomerToken(
  token: string,
  slugFromPath: string,
): Promise<CustomerClaims | null> {
  const claims = await verifySignedClaims(token);
  if (!claims) return null;
  if (claims.role !== 'CUSTOMER') return null;
  if (claims.tenantSlug !== slugFromPath) return null;
  return { role: claims.role, tenantSlug: claims.tenantSlug };
}
