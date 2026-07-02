import type { MetadataRoute } from 'next';
import { fetchPublishedHotsiteSlugs } from '@/features/platform/api';
import { SITE_URL } from '@/features/platform/hotsite/seo';

// NEXT_PUBLIC_BFF_URL is unset during the Docker build (env vars are runtime-only),
// so this route must not be statically generated at build time.
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { items } = await fetchPublishedHotsiteSlugs();

  return items.map(({ slug, updatedAt }) => ({
    url: `${SITE_URL}/${slug}`,
    lastModified: updatedAt,
  }));
}
