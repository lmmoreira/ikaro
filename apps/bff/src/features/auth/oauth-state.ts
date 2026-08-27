const SLUG_REGEX = /^[a-z0-9-]+$/;

export function isValidSlug(value: string): boolean {
  return !!value && SLUG_REGEX.test(value);
}

// Dummy origin returnTo is resolved against — never dereferenced, only used so the WHATWG URL
// parser normalizes dot-segments/percent-encoded traversal and exposes any origin change (an
// absolute URL or protocol-relative `//host/...` input) via a mismatched .origin.
const RETURN_TO_BASE = 'https://return-to.invalid';

// Open-redirect / path-traversal guard for the optional post-login returnTo path (M20-S09) —
// must be a relative path scoped to the requesting tenant's own slug. A raw `startsWith` check
// on the unparsed string is bypassable by a dot-segment or percent-encoded traversal
// (`/tenant/../other-tenant/...`, `/tenant/%2e%2e/other-tenant/...`) that still starts with the
// right prefix literally but resolves to a different tenant's path once the browser (or any URL
// parser) normalizes it (PR #433 review, CodeRabbit). Parsing via the URL constructor and
// checking the *normalized* pathname closes both: the WHATWG URL spec's path state explicitly
// treats a percent-encoded ".."-equivalent the same as a literal one when removing dot-segments,
// and an origin change flags an absolute/protocol-relative bypass attempt.
export function isValidReturnTo(value: string, tenantSlug: string): boolean {
  if (!value || !tenantSlug) return false;
  let parsed: URL;
  try {
    parsed = new URL(value, RETURN_TO_BASE);
  } catch {
    return false;
  }
  return parsed.origin === RETURN_TO_BASE && parsed.pathname.startsWith(`/${tenantSlug}/`);
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
