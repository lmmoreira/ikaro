import 'server-only';
import { cache } from 'react';
import type {
  HotsiteServiceDetailResponse,
  HotsiteServiceListResponse,
  HotsiteServiceResponse,
} from '@ikaro/types';
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

// UC-109 — one published service by the address of its page. null when there is no such page
// (unpublished, inactive, unknown slug, or another tenant's): the caller renders the same
// unavailable state for all of them, so the 404 is a normal answer, not an error. Shares the
// services cache tag, so the existing service create/update revalidation clears it, and is
// memoized per request (React cache()) because the page and its generateMetadata() both read it.
export const fetchServiceBySlug = cache(
  async (slug: string, serviceSlug: string): Promise<HotsiteServiceDetailResponse | null> => {
    const isDev = process.env.NODE_ENV === 'development';
    const res = await bffPublicFetch(
      `/public/services/by-slug/${encodeURIComponent(serviceSlug)}`,
      {
        headers: { 'X-Tenant-Slug': slug },
        next: {
          revalidate: isDev ? 0 : HOTSITE_REVALIDATE_SECONDS,
          tags: [hotsiteServicesCacheTag(slug)],
        },
      },
    );

    // 400 is a slug that cannot exist (the BFF refuses a malformed one) — also "no such page".
    if (res.status === 404 || res.status === 400) return null;
    if (!res.ok) throw new Error(`Failed to fetch service "${serviceSlug}" for slug "${slug}"`);

    return (await res.json()) as HotsiteServiceDetailResponse;
  },
);
