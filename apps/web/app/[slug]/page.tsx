import type { Metadata } from 'next';
import type { ContactModuleData, HotsiteModuleType, ServiceListModuleData } from '@beloauto/types';
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
import { isValidModuleData } from '@/lib/hotsite/module-schemas';
import { buildHotsiteMetadata, buildLocalBusinessJsonLd, toJsonLdScript } from '@/lib/hotsite/seo';

// Next.js statically analyses segment config exports — imported variables are not resolved.
// Must be a literal. Keep in sync with HOTSITE_REVALIDATE_SECONDS in lib/hotsite/revalidate.ts.
export const revalidate = 300;

type ModuleComponent = React.ComponentType<{ data: Record<string, unknown>; slug: string }>;

// Each module story (M12-S04 to S06) registers its component here. SERVICE_LIST and CONTACT are
// handled separately below — they need extra data fetched/resolved at page level, not just manifest data.
const MODULE_MAP: Partial<Record<HotsiteModuleType, ModuleComponent>> = {
  // HeroModule is typed as { data: HeroModuleData; slug: string } — double cast isolates the
  // type erasure to this single registry boundary; the component's own props stay fully typed.
  HERO: HeroModule as unknown as ModuleComponent,
  GALLERY: GalleryModule as unknown as ModuleComponent,
  TESTIMONIALS: TestimonialsModule as unknown as ModuleComponent,
  BOOKING_CTA: BookingCtaModule as unknown as ModuleComponent,
  ABOUT: AboutModule as unknown as ModuleComponent,
};

interface HotsitePageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: HotsitePageProps): Promise<Metadata> {
  const { slug } = await params;
  const manifest = await fetchManifest(slug);

  if (!manifest.isPublished) {
    return { title: 'Em breve — BeloAuto', robots: { index: false, follow: false } };
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

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: toJsonLdScript(localBusinessJsonLd) }}
      />
      {manifest.layout
        .filter((m) => m.enabled)
        .map((m, index) => {
          // Skip modules with data that fails its schema — a single malformed module must not
          // take down the whole hotsite page.
          if (!isValidModuleData(m.type, m.data)) {
            return null;
          }

          if (m.type === 'SERVICE_LIST') {
            return (
              <ServiceListModule
                key={`${m.type}-${index}`}
                data={m.data as unknown as ServiceListModuleData}
                slug={slug}
                services={services}
              />
            );
          }

          if (m.type === 'CONTACT') {
            return (
              <ContactModule
                key={`${m.type}-${index}`}
                data={m.data as unknown as ContactModuleData}
                business={manifest.business}
                slug={slug}
              />
            );
          }

          const Component = MODULE_MAP[m.type];
          if (!Component) {
            return null;
          }
          return <Component key={`${m.type}-${index}`} data={m.data} slug={slug} />;
        })}
      <Footer slug={slug} />
    </main>
  );
}
