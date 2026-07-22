import { getPublicEnv } from '@/shared/lib/runtime-env/public-env';

export interface BuildGoogleOAuthUrlParams {
  readonly tenantSlug: string;
  readonly type?: 'staff';
  readonly bffUrl?: string;
}

export function buildGoogleOAuthUrl({
  bffUrl = getPublicEnv('NEXT_PUBLIC_BFF_URL'),
  tenantSlug,
  type,
}: BuildGoogleOAuthUrlParams): string {
  if (!bffUrl) {
    throw new Error('NEXT_PUBLIC_BFF_URL is required');
  }

  const normalizedBaseUrl = bffUrl.endsWith('/') ? bffUrl.slice(0, -1) : bffUrl;
  const params = new URLSearchParams({ tenantSlug });

  if (type) {
    params.set('type', type);
  }

  return `${normalizedBaseUrl}/auth/google?${params.toString()}`;
}
