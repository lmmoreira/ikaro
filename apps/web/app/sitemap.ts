import type { MetadataRoute } from 'next';
import { fetchPublishedHotsiteSlugs } from '@/features/platform/api.server';
import { fetchServices } from '@/features/platform/hotsite/api/services.server';
import { SITE_URL } from '@/features/platform/hotsite/seo';

// NEXT_PUBLIC_BFF_URL is unset during the Docker build (env vars are runtime-only),
// so this route must not be statically generated at build time.
export const dynamic = 'force-dynamic';

// How many tenants' service lists are read at once — each read is a cached BFF call, but an
// unbounded fan-out over every published hotsite would not be.
const SERVICE_FETCH_CONCURRENCY = 10;

type SitemapEntry = MetadataRoute.Sitemap[number];

// One entry per service whose page is published (the public list exposes `publicSlug` only then),
// built from the same cached service list the hotsite itself reads — web-side orchestration, no
// cross-tenant endpoint. A tenant whose list cannot be read is skipped (its home page entry stays),
// so one failing tenant never breaks the whole /sitemap.xml.
async function serviceEntries(slug: string, lastModified: string): Promise<SitemapEntry[]> {
  try {
    const services = await fetchServices(slug);
    return services
      .filter((service) => service.isActive && service.publicSlug !== null)
      .map((service) => ({
        url: `${SITE_URL}/${slug}/servicos/${service.publicSlug}`,
        lastModified,
      }));
  } catch (err) {
    // eslint-disable-next-line no-console -- deliberate observability signal: a skipped tenant must not be silent
    console.error(
      `sitemap: skipped the service pages of "${slug}": ${err instanceof Error ? err.message : 'unknown error'}`,
    );
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { items } = await fetchPublishedHotsiteSlugs();

  const batches: (typeof items)[] = [];
  for (let start = 0; start < items.length; start += SERVICE_FETCH_CONCURRENCY) {
    batches.push(items.slice(start, start + SERVICE_FETCH_CONCURRENCY));
  }

  // One batch after another (each batch reads its tenants in parallel), chained rather than
  // awaited in a loop.
  return batches.reduce<Promise<SitemapEntry[]>>(async (previous, batch) => {
    const entries = await previous;
    const serviceEntryLists = await Promise.all(
      batch.map(({ slug, updatedAt }) => serviceEntries(slug, updatedAt)),
    );
    batch.forEach(({ slug, updatedAt }, index) => {
      entries.push(
        { url: `${SITE_URL}/${slug}`, lastModified: updatedAt },
        ...serviceEntryLists[index],
      );
    });
    return entries;
  }, Promise.resolve([]));
}
