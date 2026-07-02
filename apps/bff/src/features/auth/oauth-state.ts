const SLUG_REGEX = /^[a-z0-9-]+$/;

export function isValidSlug(value: string): boolean {
  return !!value && SLUG_REGEX.test(value);
}

export interface OAuthState {
  loginType?: 'staff';
  tenantSlug?: string;
}

export function encodeOAuthState(type: 'staff' | 'customer', tenantSlug?: string): string {
  const slug = tenantSlug && isValidSlug(tenantSlug) ? tenantSlug : undefined;
  if (type === 'staff') {
    return slug ? `__staff__:${slug}` : '__staff__';
  }
  return slug ?? '';
}

export function decodeOAuthState(state: string): OAuthState {
  if (state === '__staff__') {
    return { loginType: 'staff', tenantSlug: undefined };
  }
  if (state.startsWith('__staff__:')) {
    const extracted = state.slice('__staff__:'.length);
    return { loginType: 'staff', tenantSlug: isValidSlug(extracted) ? extracted : undefined };
  }
  return { tenantSlug: isValidSlug(state) ? state : undefined };
}
