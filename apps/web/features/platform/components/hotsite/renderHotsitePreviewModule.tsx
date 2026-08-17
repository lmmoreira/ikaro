import type { HotsiteModuleRenderPlanItem } from '@/features/platform/hotsite/page-model';
import { HeroModule } from '@/shells/hotsite/components/HeroModule';
import { ServiceListModule } from '@/shells/hotsite/components/ServiceListModule';
import { GalleryModule } from '@/shells/hotsite/components/GalleryModule';
import { BookingCtaModule } from '@/shells/hotsite/components/BookingCtaModule';
import { TestimonialsModule } from '@/shells/hotsite/components/TestimonialsModule';
import { AboutModule } from '@/shells/hotsite/components/AboutModule';
import { ContactModule } from '@/shells/hotsite/components/ContactModule';
import { Footer } from '@/shells/hotsite/components/Footer';
import type { PreviewSupplementaryData } from './useHotsitePreviewData';

export function renderHotsitePreviewModule(
  { parsed, bgVariant }: HotsiteModuleRenderPlanItem,
  index: number,
  ctx: {
    readonly tenantSlug: string;
    readonly tenantBrand: { name: string; tagline?: string } | undefined;
    readonly logoUrl: string;
    readonly data: PreviewSupplementaryData;
  },
): React.JSX.Element | null {
  const key = `${parsed.type}-${index}`;
  const { tenantSlug, tenantBrand, logoUrl, data } = ctx;

  if (parsed.type === 'HERO') {
    return <HeroModule key={key} data={parsed.data} slug={tenantSlug} tenantBrand={tenantBrand} />;
  }
  if (parsed.type === 'SERVICE_LIST') {
    return (
      <ServiceListModule
        key={key}
        data={parsed.data}
        slug={tenantSlug}
        services={data.services}
        bgVariant={bgVariant}
      />
    );
  }
  if (parsed.type === 'CONTACT') {
    return (
      <ContactModule
        key={key}
        data={parsed.data}
        business={data.business}
        slug={tenantSlug}
        bgVariant={bgVariant}
      />
    );
  }
  if (parsed.type === 'BOOKING_CTA') {
    return (
      <BookingCtaModule key={key} data={parsed.data} slug={tenantSlug} tenantBrand={tenantBrand} />
    );
  }
  if (parsed.type === 'GALLERY') {
    return <GalleryModule key={key} data={parsed.data} slug={tenantSlug} bgVariant={bgVariant} />;
  }
  if (parsed.type === 'TESTIMONIALS') {
    return (
      <TestimonialsModule key={key} data={parsed.data} slug={tenantSlug} bgVariant={bgVariant} />
    );
  }
  if (parsed.type === 'ABOUT') {
    return <AboutModule key={key} data={parsed.data} slug={tenantSlug} bgVariant={bgVariant} />;
  }
  if (parsed.type === 'FOOTER') {
    return (
      <Footer
        key={key}
        data={parsed.data}
        slug={tenantSlug}
        tenantName={data.tenantName}
        business={data.business}
        logoUrl={logoUrl}
      />
    );
  }
  return null;
}
