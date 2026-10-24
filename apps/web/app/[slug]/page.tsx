import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { fetchManifest } from '@/features/platform/api.server';
import { JsonLdScript } from '@/shells/hotsite/components/JsonLdScript';
import { HotsiteAuthBar } from '@/shells/hotsite/components/HotsiteAuthBar';
import { HotsiteModuleView } from '@/shells/hotsite/components/HotsiteModuleView';
import { Unavailable } from '@/shells/hotsite/components/Unavailable';
import {
  buildHotsiteModuleRenderPlan,
  resolveHotsiteDisplayName,
  resolveHotsiteNavigation,
  resolveHotsiteNavigationCta,
  shouldSkipDivider,
} from '@/features/platform/hotsite/page-model';
import { buildHotsiteMetadata, buildLocalBusinessJsonLd } from '@/features/platform/hotsite/seo';
import { fetchServices } from '@/features/platform/hotsite/api/services.server';

// Next.js statically analyses segment config exports — imported variables are not resolved.
// Must be a literal. Keep in sync with HOTSITE_REVALIDATE_SECONDS in lib/hotsite/revalidate.ts.
export const revalidate = 300;

interface HotsitePageProps {
  readonly params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: HotsitePageProps): Promise<Metadata> {
  const { slug } = await params;
  const manifest = await fetchManifest(slug);

  if (!manifest.isPublished) {
    const t = await getTranslations('hotsite');
    return { title: `${t('unavailable.label')} — Ikaro`, robots: { index: false, follow: false } };
  }

  return await buildHotsiteMetadata({ manifest, slug });
}

export default async function HotsitePage({ params }: HotsitePageProps) {
  const { slug } = await params;
  const manifest = await fetchManifest(slug);

  if (!manifest.isPublished) {
    return <Unavailable />;
  }

  const localBusinessJsonLd = buildLocalBusinessJsonLd({ manifest, slug });

  const { branding, business } = manifest;
  const alternateSectionBg = branding.alternateSectionBg ?? false;
  const dividerStyle = branding.dividerStyle ?? 'none';
  const tenantBrand = branding.brandName
    ? { name: branding.brandName, tagline: branding.brandTagline }
    : undefined;
  // Display name for footer and brand card: prefer branding.brandName, fall back to tenant name.
  const displayName = resolveHotsiteDisplayName(manifest);
  const modulesWithVariant = buildHotsiteModuleRenderPlan(
    manifest.layout,
    alternateSectionBg,
    branding,
  );
  const navigation = resolveHotsiteNavigation(manifest.layout, modulesWithVariant);
  const hasServiceList = modulesWithVariant.some(({ parsed }) => parsed.type === 'SERVICE_LIST');
  const services = hasServiceList ? await fetchServices(slug) : [];

  const dividerEl =
    dividerStyle === 'none' ? null : (
      <hr
        aria-hidden="true"
        style={{ border: 'none', height: '1px', background: 'var(--ba-divider)', margin: 0 }}
      />
    );

  return (
    <main>
      <HotsiteAuthBar
        slug={slug}
        logoUrl={branding.logoUrl}
        tenantName={displayName}
        navigation={navigation}
        navigationCta={resolveHotsiteNavigationCta(manifest.layout)}
      />
      <JsonLdScript data={localBusinessJsonLd} />
      {modulesWithVariant.map((item, index) => {
        const { parsed } = item;
        const key = `${parsed.type}-${index}`;
        const previousType = index > 0 ? modulesWithVariant[index - 1].parsed.type : undefined;
        const moduleEl = (
          <HotsiteModuleView
            item={item}
            slug={slug}
            tenantName={displayName}
            tenantBrand={tenantBrand}
            logoUrl={branding.logoUrl}
            business={business}
            services={services}
          />
        );

        return (
          <div key={key}>
            {!shouldSkipDivider(index, parsed.type, previousType) && dividerEl}
            {moduleEl}
          </div>
        );
      })}
    </main>
  );
}
