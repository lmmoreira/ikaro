import { getPublicEnv } from '@/shared/lib/runtime-env/public-env';

function stripTrailingSlashes(value: string): string {
  let result = value;
  while (result.endsWith('/')) {
    result = result.slice(0, -1);
  }
  return result;
}

// The public site origin, without a trailing slash. getPublicEnv reads the container's live env
// on the server and the value the root layout injected on the client, so this is safe in both —
// never read NEXT_PUBLIC_SITE_URL directly in client code (frozen at `next build` time, TD29).
export function resolveSiteOrigin(): string {
  return stripTrailingSlashes(getPublicEnv('NEXT_PUBLIC_SITE_URL') || 'http://localhost:3000');
}

export function buildPublicHotsiteUrl(tenantSlug: string): string {
  return `${resolveSiteOrigin()}/${tenantSlug}`;
}
