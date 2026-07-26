import 'server-only';
import type { HotsiteServiceListResponse, HotsiteServiceResponse } from '@ikaro/types';
import {
  HOTSITE_REVALIDATE_SECONDS,
  hotsiteServicesCacheTag,
} from '@/features/platform/hotsite/revalidate';
import { bffPublicFetch } from '@/shared/lib/api/bff-server';

// Server-only — carries the Next Data Cache tag app/api/revalidate/route.ts invalidates on
// service create/update/activate/deactivate. Client callers (HotsitePreview.tsx) use
// fetchServicesClient() in services.ts instead.
export async function fetchServices(slug: string): Promise<HotsiteServiceResponse[]> {
  const isDev = process.env.NODE_ENV === 'development';
  const res = await bffPublicFetch('/public/services', {
    headers: { 'X-Tenant-Slug': slug },
    next: {
      revalidate: isDev ? 0 : HOTSITE_REVALIDATE_SECONDS,
      tags: [hotsiteServicesCacheTag(slug)],
    },
  });

  if (!res.ok) throw new Error(`Failed to fetch services for slug "${slug}"`);

  const data = (await res.json()) as HotsiteServiceListResponse;
  return data.items;
}
