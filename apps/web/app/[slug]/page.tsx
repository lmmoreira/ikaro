import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { fetchManifest } from '@/lib/api/platform';
import { AboutModule } from '@/components/hotsite/AboutModule';
import { BookingCtaModule } from '@/components/hotsite/BookingCtaModule';
import { ContactModule } from '@/components/hotsite/ContactModule';
import { JsonLdScript } from '@/components/hotsite/JsonLdScript';
import { Footer } from '@/components/hotsite/Footer';
import { GalleryModule } from '@/components/hotsite/GalleryModule';
import { HeroModule } from '@/components/hotsite/HeroModule';
import { HotsiteAuthBar } from '@/components/hotsite/HotsiteAuthBar';
import { ServiceListModule } from '@/components/hotsite/ServiceListModule';
import { TestimonialsModule } from '@/components/hotsite/TestimonialsModule';
import { Unavailable } from '@/components/hotsite/Unavailable';
import { buildHotsiteModuleRenderPlan, resolveHotsiteDisplayName } from '@/lib/hotsite/page-model';
import { buildHotsiteMetadata, buildLocalBusinessJsonLd } from '@/lib/hotsite/seo';
import { fetchServices } from '@/lib/api/hotsite/services';

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
  const modulesWithVariant = buildHotsiteModuleRenderPlan(manifest.layout, alternateSectionBg);
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
      <HotsiteAuthBar slug={slug} />
      <JsonLdScript data={localBusinessJsonLd} />
      {modulesWithVariant.map(({ parsed, bgVariant }, index) => {
        const key = `${parsed.type}-${index}`;
        let moduleEl: React.ReactNode = null;

        if (parsed.type === 'HERO') {
          moduleEl = (
            <HeroModule key={key} data={parsed.data} slug={slug} tenantBrand={tenantBrand} />
          );
        } else if (parsed.type === 'SERVICE_LIST') {
          moduleEl = (
            <ServiceListModule
              key={key}
              data={parsed.data}
              slug={slug}
              services={services}
              bgVariant={bgVariant}
            />
          );
        } else if (parsed.type === 'CONTACT') {
          moduleEl = (
            <ContactModule
              key={key}
              data={parsed.data}
              business={business}
              slug={slug}
              bgVariant={bgVariant}
            />
          );
        } else if (parsed.type === 'BOOKING_CTA') {
          moduleEl = (
            <BookingCtaModule key={key} data={parsed.data} slug={slug} tenantBrand={tenantBrand} />
          );
        } else if (parsed.type === 'GALLERY') {
          moduleEl = (
            <GalleryModule key={key} data={parsed.data} slug={slug} bgVariant={bgVariant} />
          );
        } else if (parsed.type === 'TESTIMONIALS') {
          moduleEl = (
            <TestimonialsModule key={key} data={parsed.data} slug={slug} bgVariant={bgVariant} />
          );
        } else if (parsed.type === 'ABOUT') {
          moduleEl = <AboutModule key={key} data={parsed.data} slug={slug} bgVariant={bgVariant} />;
        } else if (parsed.type === 'FOOTER') {
          moduleEl = (
            <Footer
              key={key}
              data={parsed.data}
              slug={slug}
              tenantName={displayName}
              business={business}
            />
          );
        }

        return moduleEl ? (
          <div key={key}>
            {index > 0 && parsed.type !== 'FOOTER' && dividerEl}
            {moduleEl}
          </div>
        ) : null;
      })}
    </main>
  );
}
