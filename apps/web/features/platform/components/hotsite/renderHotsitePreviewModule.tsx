import type { HotsiteModuleRenderPlanItem } from '@/features/platform/hotsite/page-model';
import { HeroModule } from '@/shells/hotsite/components/HeroModule';
import { ServiceListModule } from '@/shells/hotsite/components/ServiceListModule';
import { GalleryModule } from '@/shells/hotsite/components/GalleryModule';
import { BookingCtaModule } from '@/shells/hotsite/components/BookingCtaModule';
import { TestimonialsModule } from '@/shells/hotsite/components/TestimonialsModule';
import { AboutModule } from '@/shells/hotsite/components/AboutModule';
import { ContactModule } from '@/shells/hotsite/components/ContactModule';
import { Footer } from '@/shells/hotsite/components/Footer';
import { ChatbotWidget } from '@/shells/hotsite/components/ChatbotWidget';
import { LeadFormModule } from '@/shells/hotsite/components/LeadFormModule';
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
  if (parsed.type === 'CHATBOT') {
    // Same component the public page renders — CHATBOT's real availability is always a live
    // pre-flight check (docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md § CHATBOT), never derivable from
    // the manifest/draft alone, so reusing ChatbotWidget as-is is the only faithful preview.
    return (
      <ChatbotWidget
        key={key}
        data={parsed.data}
        slug={tenantSlug}
        business={data.business}
        tenantName={data.tenantName}
      />
    );
  }
  if (parsed.type === 'LEAD_FORM') {
    return <LeadFormModule key={key} data={parsed.data} slug={tenantSlug} />;
  }
  return null;
}
