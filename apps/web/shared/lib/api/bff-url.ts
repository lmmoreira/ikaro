import { getPublicEnv } from '@/shared/lib/runtime-env/public-env';

export function getBffUpstreamUrl(): string {
  if (typeof window !== 'undefined') {
    return getPublicEnv('NEXT_PUBLIC_BFF_URL') || process.env.NEXT_PUBLIC_BFF_URL || '';
  }
  return process.env.BFF_UPSTREAM_URL ?? process.env.NEXT_PUBLIC_BFF_URL ?? '';
}

export function buildBffUrl(path: string): string {
  return `${getBffUpstreamUrl()}${path}`;
}
