import type { HotsiteServiceListResponse, HotsiteServiceResponse } from '@ikaro/types';
import { HOTSITE_REVALIDATE_SECONDS } from '@/features/platform/hotsite/revalidate';
import { getPublicEnv } from '@/shared/lib/runtime-env/public-env';

// Isomorphic (also called client-side by HotsitePreview.tsx) — next.revalidate only means
// anything server-side, so this must stay a plain fetch(), same reasoning as
// features/platform/api.ts's fetchManifestResponse (TD29).
export async function fetchServices(slug: string): Promise<HotsiteServiceResponse[]> {
  const isDev = process.env.NODE_ENV === 'development';
  const res = await fetch(`${getPublicEnv('NEXT_PUBLIC_BFF_URL')}/public/services`, {
    headers: { 'X-Tenant-Slug': slug },
    next: { revalidate: isDev ? 0 : HOTSITE_REVALIDATE_SECONDS },
  });

  if (!res.ok) throw new Error(`Failed to fetch services for slug "${slug}"`);

  const data = (await res.json()) as HotsiteServiceListResponse;
  return data.items;
}
