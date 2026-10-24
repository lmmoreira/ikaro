import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { fetchManifest } from '@/features/platform/api.server';
import { fetchServiceBySlug } from '@/features/platform/hotsite/api/services.server';
import { resolveHotsiteImageDisplayUrl } from '@/features/platform/hotsite/resolve-hotsite-image-url';
import {
  buildHotsiteModuleRenderPlan,
  resolveHotsiteDisplayName,
  resolveManifestNavigation,
  resolveHotsiteNavigationCta,
} from '@/features/platform/hotsite/page-model';
import { buildHotsiteMetadata } from '@/features/platform/hotsite/seo';
import {
  resolveServiceDetailFooter,
  resolveServiceDetailSettings,
  resolveServiceMetaDescription,
} from '@/features/platform/hotsite/service-detail';
import { Footer } from '@/shells/hotsite/components/Footer';
import { HotsiteAuthBar } from '@/shells/hotsite/components/HotsiteAuthBar';
import { ServiceDetailPage } from '@/shells/hotsite/components/ServiceDetailPage';
import { ServiceDetailUnavailable } from '@/shells/hotsite/components/ServiceDetailUnavailable';
import { Unavailable } from '@/shells/hotsite/components/Unavailable';

// Next.js statically analyses segment config exports — imported variables are not resolved.
// Must be a literal. Keep in sync with HOTSITE_REVALIDATE_SECONDS in lib/hotsite/revalidate.ts.
export const revalidate = 300;

interface ServiceDetailRouteProps {
  readonly params: Promise<{ slug: string; serviceSlug: string }>;
}

const NOINDEX = { index: false, follow: false } as const;

// UC-109. Both the metadata and the page read the same two fetches (React cache()), and both treat
// an unpublished hotsite, an unknown slug, an unpublished page and an inactive service alike.
export async function generateMetadata({ params }: ServiceDetailRouteProps): Promise<Metadata> {
  const { slug, serviceSlug } = await params;
  const manifest = await fetchManifest(slug);
  const service = manifest.isPublished ? await fetchServiceBySlug(slug, serviceSlug) : null;

  if (!service) {
    const t = await getTranslations('hotsite');
    return {
      title: `${t('serviceDetail.notFoundTitle')} — Ikaro`,
      robots: NOINDEX,
    };
  }

  const coverImageUrl = service.profile.coverImageUrl;
  return buildHotsiteMetadata({
    manifest,
    slug,
    path: `/servicos/${service.publicSlug}`,
    override: {
      title: `${service.name} — ${resolveHotsiteDisplayName(manifest)}`,
      description: resolveServiceMetaDescription(service),
      ogImageUrl: coverImageUrl ? resolveHotsiteImageDisplayUrl(coverImageUrl) : undefined,
    },
  });
}

export default async function ServiceDetailRoute({ params }: ServiceDetailRouteProps) {
  const { slug, serviceSlug } = await params;
  const manifest = await fetchManifest(slug);

  if (!manifest.isPublished) return <Unavailable />;

  const service = await fetchServiceBySlug(slug, serviceSlug);
  if (!service) return <ServiceDetailUnavailable slug={slug} />;

  const displayName = resolveHotsiteDisplayName(manifest);
  const footer = resolveServiceDetailFooter(manifest);
  const footerPresentation = buildHotsiteModuleRenderPlan(
    manifest.layout,
    false,
    manifest.branding,
  ).find((item) => item.parsed.type === 'FOOTER');

  return (
    <>
      <HotsiteAuthBar
        slug={slug}
        logoUrl={manifest.branding.logoUrl}
        tenantName={displayName}
        navigation={resolveManifestNavigation(manifest)}
        navigationCta={resolveHotsiteNavigationCta(manifest.layout)}
      />
      <ServiceDetailPage
        slug={slug}
        service={service}
        settings={resolveServiceDetailSettings(manifest)}
      />
      {footer && (
        <Footer
          data={footer}
          slug={slug}
          tenantName={displayName}
          business={manifest.business}
          logoUrl={manifest.branding.logoUrl}
          presentation={footerPresentation?.presentation}
          sectionTokens={footerPresentation?.sectionTokens}
        />
      )}
    </>
  );
}
