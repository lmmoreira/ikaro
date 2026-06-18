import type { Metadata } from 'next';
import type { HotsiteModuleType } from '@ikaro/types';
import { fetchManifest } from '@/lib/api/platform';
import { fetchServices } from '@/lib/api/services';
import { AboutModule } from '@/components/hotsite/AboutModule';
import { BookingCtaModule } from '@/components/hotsite/BookingCtaModule';
import { ContactModule } from '@/components/hotsite/ContactModule';
import { Footer } from '@/components/hotsite/Footer';
import { GalleryModule } from '@/components/hotsite/GalleryModule';
import { HeroModule } from '@/components/hotsite/HeroModule';
import { ServiceListModule } from '@/components/hotsite/ServiceListModule';
import { TestimonialsModule } from '@/components/hotsite/TestimonialsModule';
import { Unavailable } from '@/components/hotsite/Unavailable';
import {
  AboutModuleDataSchema,
  BookingCtaModuleDataSchema,
  ContactModuleDataSchema,
  FooterModuleDataSchema,
  GalleryModuleDataSchema,
  HeroModuleDataSchema,
  ServiceListModuleDataSchema,
  TestimonialsModuleDataSchema,
  isValidModuleData,
} from '@/lib/hotsite/module-schemas';
import { buildHotsiteMetadata, buildLocalBusinessJsonLd, toJsonLdScript } from '@/lib/hotsite/seo';

// Next.js statically analyses segment config exports — imported variables are not resolved.
// Must be a literal. Keep in sync with HOTSITE_REVALIDATE_SECONDS in lib/hotsite/revalidate.ts.
export const revalidate = 300;

// Module types that manage their own background (hero-bg / bgStyle) — they still count in the
// alternation index so that the first content section after HERO is always the alt color.
const NON_ALTERNATING_TYPES: ReadonlySet<HotsiteModuleType> = new Set([
  'HERO',
  'BOOKING_CTA',
  'FOOTER',
]);

interface HotsitePageProps {
  readonly params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: HotsitePageProps): Promise<Metadata> {
  const { slug } = await params;
  const manifest = await fetchManifest(slug);

  if (!manifest.isPublished) {
    return { title: 'Em breve — Ikaro', robots: { index: false, follow: false } };
  }

  return buildHotsiteMetadata({ manifest, slug });
}

export default async function HotsitePage({ params }: HotsitePageProps) {
  const { slug } = await params;
  const manifest = await fetchManifest(slug);

  if (!manifest.isPublished) {
    return <Unavailable />;
  }

  const hasServiceList = manifest.layout.some((m) => m.enabled && m.type === 'SERVICE_LIST');
  const services = hasServiceList ? await fetchServices(slug) : [];
  const localBusinessJsonLd = buildLocalBusinessJsonLd({ manifest, slug });

  const { branding, business, tenant } = manifest;
  const alternateSectionBg = branding.alternateSectionBg ?? false;
  const dividerStyle = branding.dividerStyle ?? 'none';
  const tenantBrand = branding.brandName
    ? { name: branding.brandName, tagline: branding.brandTagline }
    : undefined;
  // Display name for footer and brand card: prefer branding.brandName, fall back to tenant name.
  const displayName = branding.brandName ?? tenant.name;

  const enabledModules = manifest.layout.filter(
    (m) => m.enabled && isValidModuleData(m.type, m.data),
  );

  // Every module — including HERO, BOOKING_CTA, FOOTER — advances the alternation counter so
  // that the first content section after HERO gets the alt (secondary) background.
  let altIndex = 0;
  const modulesWithVariant = enabledModules.map((m) => {
    const isAlt = alternateSectionBg && altIndex % 2 === 1;
    altIndex++;
    const participates = !NON_ALTERNATING_TYPES.has(m.type);
    return {
      module: m,
      bgVariant: participates && isAlt ? ('alt' as const) : ('default' as const),
    };
  });

  const dividerEl =
    dividerStyle === 'none' ? null : (
      <hr
        aria-hidden="true"
        style={{ border: 'none', height: '1px', background: 'var(--ba-divider)', margin: 0 }}
      />
    );

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toJsonLdScript(localBusinessJsonLd) }}
      />
      {modulesWithVariant.map(({ module: m, bgVariant }, index) => {
        const key = `${m.type}-${index}`;
        let moduleEl: React.ReactNode = null;

        if (m.type === 'HERO') {
          moduleEl = (
            <HeroModule
              key={key}
              data={HeroModuleDataSchema.parse(m.data)}
              slug={slug}
              tenantBrand={tenantBrand}
            />
          );
        } else if (m.type === 'SERVICE_LIST') {
          moduleEl = (
            <ServiceListModule
              key={key}
              data={ServiceListModuleDataSchema.parse(m.data)}
              slug={slug}
              services={services}
              bgVariant={bgVariant}
            />
          );
        } else if (m.type === 'CONTACT') {
          moduleEl = (
            <ContactModule
              key={key}
              data={ContactModuleDataSchema.parse(m.data)}
              business={business}
              slug={slug}
              bgVariant={bgVariant}
            />
          );
        } else if (m.type === 'BOOKING_CTA') {
          moduleEl = (
            <BookingCtaModule
              key={key}
              data={BookingCtaModuleDataSchema.parse(m.data)}
              slug={slug}
              tenantBrand={tenantBrand}
            />
          );
        } else if (m.type === 'GALLERY') {
          moduleEl = (
            <GalleryModule
              key={key}
              data={GalleryModuleDataSchema.parse(m.data)}
              slug={slug}
              bgVariant={bgVariant}
            />
          );
        } else if (m.type === 'TESTIMONIALS') {
          moduleEl = (
            <TestimonialsModule
              key={key}
              data={TestimonialsModuleDataSchema.parse(m.data)}
              slug={slug}
              bgVariant={bgVariant}
            />
          );
        } else if (m.type === 'ABOUT') {
          moduleEl = (
            <AboutModule
              key={key}
              data={AboutModuleDataSchema.parse(m.data)}
              slug={slug}
              bgVariant={bgVariant}
            />
          );
        } else if (m.type === 'FOOTER') {
          moduleEl = (
            <Footer
              key={key}
              data={FooterModuleDataSchema.parse(m.data)}
              slug={slug}
              tenantName={displayName}
              business={business}
            />
          );
        }

        return moduleEl ? (
          <div key={key}>
            {index > 0 && m.type !== 'FOOTER' && dividerEl}
            {moduleEl}
          </div>
        ) : null;
      })}
    </main>
  );
}
