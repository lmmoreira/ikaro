import { getPublicEnv } from '@/shared/lib/runtime-env/public-env';

export function getBffUpstreamUrl(): string {
  if (typeof window !== 'undefined') {
    return getPublicEnv('NEXT_PUBLIC_BFF_URL') || process.env.NEXT_PUBLIC_BFF_URL || '';
  }
  return process.env.BFF_UPSTREAM_URL ?? process.env.NEXT_PUBLIC_BFF_URL ?? '';
}

// TD38: normalizes a trailing slash on the resolved base before joining, mirroring
// apps/web/app/v1/[...path]/route.ts's own upstreamUrl() — a real risk once BFF_UPSTREAM_URL's
// shape changes from a fixed public hostname to a Cloud Run-generated internal service URI.
export function buildBffUrl(path: string): string {
  return `${getBffUpstreamUrl().replace(/\/$/, '')}${path}`;
}
