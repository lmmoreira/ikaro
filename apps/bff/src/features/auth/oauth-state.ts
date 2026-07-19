const SLUG_REGEX = /^[a-z0-9-]+$/;

export function isValidSlug(value: string): boolean {
  return !!value && SLUG_REGEX.test(value);
}

export interface OAuthState {
  loginType?: 'staff';
  tenantSlug?: string;
}

// Signed via OAuthStateService (M17-S32) — the JWT payload carrying the routing data plus
// a nonce for uniqueness. `nonce` is never read back by callers, only `loginType`/`tenantSlug`.
export interface OAuthStatePayload extends OAuthState {
  nonce: string;
}
