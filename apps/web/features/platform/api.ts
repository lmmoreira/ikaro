import { notFound } from 'next/navigation';
import type { HotsiteManifestResponse, HotsiteSitemapEntryListResponse } from '@ikaro/types';
import { HOTSITE_REVALIDATE_SECONDS } from '@/features/platform/hotsite/revalidate';
import { getPublicEnv } from '@/shared/lib/runtime-env/public-env';

// Single source of truth for the manifest URL — fetchManifest() (below) and
// resolveLocale() (shared/lib/i18n/resolve-locale.ts) both need it but apply different
// error-handling semantics (notFound()/throw vs. a soft locale fallback), so
// each wraps this raw fetch rather than duplicating the URL independently.
// This function is isomorphic (also called client-side by HotsitePreview.tsx), and its
// `next.revalidate` option is meaningless outside a server-rendered fetch, so it must stay a
// plain fetch() — neither bffClient (no next.revalidate support) nor bffServerFetch (server-only,
// TD29) can serve it.
export async function fetchManifestResponse(slug: string): Promise<Response> {
  const isDev = process.env.NODE_ENV === 'development';
  return fetch(`${getPublicEnv('NEXT_PUBLIC_BFF_URL')}/public/platform/manifest/${slug}`, {
    next: { revalidate: isDev ? 0 : HOTSITE_REVALIDATE_SECONDS },
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
  const res = await fetch(
    `${getPublicEnv('NEXT_PUBLIC_BFF_URL')}/public/platform/published-hotsites`,
    {
      next: { revalidate: isDev ? 0 : HOTSITE_REVALIDATE_SECONDS },
    },
  );

  if (!res.ok) throw new Error('Failed to fetch published hotsites');

  return res.json() as Promise<HotsiteSitemapEntryListResponse>;
}
