import { getPublicEnv } from '@/shared/lib/runtime-env/public-env';

export interface BuildGoogleOAuthUrlParams {
  readonly tenantSlug: string;
  readonly type?: 'staff';
  readonly bffUrl?: string;
  // Post-login redirect target (M20-S09) — validated BFF-side (isValidReturnTo, oauth-state.ts)
  // against open redirect; this side just forwards whatever the caller supplies.
  readonly returnTo?: string;
}

export function buildGoogleOAuthUrl({
  bffUrl = getPublicEnv('NEXT_PUBLIC_BFF_URL'),
  tenantSlug,
  type,
  returnTo,
}: BuildGoogleOAuthUrlParams): string {
  if (!bffUrl) {
    throw new Error('NEXT_PUBLIC_BFF_URL is required');
  }

  const normalizedBaseUrl = bffUrl.endsWith('/') ? bffUrl.slice(0, -1) : bffUrl;
  const params = new URLSearchParams({ tenantSlug });

  if (type) {
    params.set('type', type);
  }

  if (returnTo) {
    params.set('returnTo', returnTo);
  }

  return `${normalizedBaseUrl}/auth/google?${params.toString()}`;
}
