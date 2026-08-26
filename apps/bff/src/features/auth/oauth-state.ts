const SLUG_REGEX = /^[a-z0-9-]+$/;

export function isValidSlug(value: string): boolean {
  return !!value && SLUG_REGEX.test(value);
}

// Open-redirect guard for the optional post-login returnTo path (M20-S09) — must be a relative
// path scoped to the requesting tenant's own slug, never an absolute URL, a protocol-relative
// `//host/...`, or a path under a different tenant. Requires the exact `/${tenantSlug}/` prefix,
// not just "contains the slug somewhere".
export function isValidReturnTo(value: string, tenantSlug: string): boolean {
  return !!value && !!tenantSlug && value.startsWith(`/${tenantSlug}/`);
}

export interface OAuthState {
  loginType?: 'staff';
  tenantSlug?: string;
  returnTo?: string;
}

// Signed via OAuthStateService (M17-S32) — the JWT payload carrying the routing data plus a
// nonce. The same nonce is mirrored into a short-lived httpOnly cookie (double-submit pattern,
// see OAUTH_NONCE_COOKIE_OPTIONS in cookie-options.ts) so decodeOAuthState() can bind the
// callback to the browser that started the flow — signature/TTL alone only prove integrity,
// not browser origin (RFC 6749 §10.12).
export interface OAuthStatePayload extends OAuthState {
  nonce: string;
}

export interface EncodedOAuthState {
  state: string;
  nonce: string;
}

// Thrown by OAuthStateService.decodeOAuthState() for every rejection reason — missing state,
// tampered/expired JWT, or a missing/mismatched nonce cookie. GoogleCallbackGuard.handleRequest()
// checks `instanceof` so only this failure maps to 400 BFF_OAUTH_STATE_INVALID; unrelated
// Passport failures (e.g. Google returning no email) keep their normal handling.
export class OAuthStateInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OAuthStateInvalidError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
