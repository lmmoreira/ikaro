import 'server-only';
import { notFound } from 'next/navigation';
import type { HotsiteManifestResponse, HotsiteSitemapEntryListResponse } from '@ikaro/types';
import {
  HOTSITE_PUBLISHED_SLUGS_CACHE_TAG,
  HOTSITE_REVALIDATE_SECONDS,
  hotsiteManifestCacheTag,
} from '@/features/platform/hotsite/revalidate';
import { bffPublicFetch } from '@/shared/lib/api/bff-server';

// Single source of truth for the manifest URL — fetchManifest() (below) and
// resolveLocale() (shared/lib/i18n/resolve-locale.ts) both need it but apply different
// error-handling semantics (notFound()/throw vs. a soft locale fallback), so
// each wraps this response rather than duplicating the request independently.
// Server-only: next.revalidate/next.tags only mean anything for a server-rendered fetch, and
// notFound() only works from a Server Component/Route Handler. Client callers (HotsitePreview.tsx)
// use fetchManifestClient() in api.ts instead — that goes through bffClient/the same-origin
// gateway with no Next Data Cache options, since browser requests don't participate in it anyway.
export async function fetchManifestResponse(slug: string): Promise<Response> {
  const isDev = process.env.NODE_ENV === 'development';
  return bffPublicFetch(`/public/platform/manifest/${slug}`, {
    next: {
      revalidate: isDev ? 0 : HOTSITE_REVALIDATE_SECONDS,
      tags: [hotsiteManifestCacheTag(slug)],
    },
  });
}

export async function fetchManifest(slug: string): Promise<HotsiteManifestResponse> {
  const res = await fetchManifestResponse(slug);

  if (res.status === 404) notFound();
  if (!res.ok) throw new Error(`Failed to fetch manifest for slug "${slug}"`);

  return res.json() as Promise<HotsiteManifestResponse>;
}

export async function fetchPublishedHotsiteSlugs(): Promise<HotsiteSitemapEntryListResponse> {
  const isDev = process.env.NODE_ENV === 'development';
  const res = await bffPublicFetch('/public/platform/published-hotsites', {
    next: {
      revalidate: isDev ? 0 : HOTSITE_REVALIDATE_SECONDS,
      tags: [HOTSITE_PUBLISHED_SLUGS_CACHE_TAG],
    },
  });

  if (!res.ok) throw new Error('Failed to fetch published hotsites');

  return res.json() as Promise<HotsiteSitemapEntryListResponse>;
}
