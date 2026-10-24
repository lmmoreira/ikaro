import type React from 'react';
import type { HotsiteBusinessInfoResponse, HotsiteServiceResponse } from '@ikaro/types';
import type { HotsiteModuleRenderPlanItem } from '@/features/platform/hotsite/page-model';
import { AboutModule } from './AboutModule';
import { BookingCtaModule } from './BookingCtaModule';
import { ChatbotWidget } from './ChatbotWidget';
import { ContactModule } from './ContactModule';
import { ContentBlockModule } from './ContentBlockModule';
import { Footer } from './Footer';
import { GalleryModule } from './GalleryModule';
import { HeroModule } from './HeroModule';
import { LeadFormModule } from './LeadFormModule';
import { ServiceListModule } from './ServiceListModule';
import { TestimonialsModule } from './TestimonialsModule';

export interface HotsiteModuleViewProps {
  readonly item: HotsiteModuleRenderPlanItem;
  readonly slug: string;
  readonly tenantName: string;
  readonly tenantBrand: { name: string; tagline?: string } | undefined;
  readonly logoUrl: string;
  readonly business: HotsiteBusinessInfoResponse;
  readonly services: readonly HotsiteServiceResponse[];
}

// The one place a render-plan item becomes a component. The public page and the visual editor's
// preview both render through it (the preview only adds its selection wrapper around the result),
// so the two cannot drift apart: what a manager sees is what gets published.
//
// Every module type is handled and none has a fallback branch: adding a type to the union breaks
// this switch at compile time. NAVIGATION is page chrome, not a section — it is rendered by the top
// bar from resolveHotsiteNavigation() and never reaches a render plan.
export function HotsiteModuleView({
  item,
  slug,
  tenantName,
  tenantBrand,
  logoUrl,
  business,
  services,
}: HotsiteModuleViewProps): React.JSX.Element | null {
  const { parsed, bgVariant, presentation, sectionTokens, tints } = item;
  const section = { presentation, sectionTokens, tints };

  switch (parsed.type) {
    case 'NAVIGATION':
      return null;
    case 'HERO':
      return <HeroModule data={parsed.data} slug={slug} tenantBrand={tenantBrand} {...section} />;
    case 'SERVICE_LIST':
      return (
        <ServiceListModule
          data={parsed.data}
          slug={slug}
          services={services}
          bgVariant={bgVariant}
          {...section}
        />
      );
    case 'GALLERY':
      return <GalleryModule data={parsed.data} slug={slug} bgVariant={bgVariant} {...section} />;
    case 'TESTIMONIALS':
      return (
        <TestimonialsModule data={parsed.data} slug={slug} bgVariant={bgVariant} {...section} />
      );
    case 'BOOKING_CTA':
      return (
        <BookingCtaModule data={parsed.data} slug={slug} tenantBrand={tenantBrand} {...section} />
      );
    case 'ABOUT':
      return <AboutModule data={parsed.data} slug={slug} bgVariant={bgVariant} {...section} />;
    case 'CONTENT_BLOCK':
      return (
        <ContentBlockModule data={parsed.data} slug={slug} bgVariant={bgVariant} {...section} />
      );
    case 'CONTACT':
      return (
        <ContactModule
          data={parsed.data}
          business={business}
          slug={slug}
          bgVariant={bgVariant}
          {...section}
        />
      );
    case 'LEAD_FORM':
      return <LeadFormModule data={parsed.data} slug={slug} {...section} />;
    case 'FOOTER':
      return (
        <Footer
          data={parsed.data}
          slug={slug}
          tenantName={tenantName}
          business={business}
          logoUrl={logoUrl}
          {...section}
        />
      );
    case 'CHATBOT':
      // The same component the preview renders: CHATBOT's real availability is always a live
      // pre-flight check (docs/HOTSITE_DYNAMIC_ARCHITECTURE.md § CHATBOT), never derivable from
      // the manifest/draft alone, so reusing ChatbotWidget as-is is the only faithful preview.
      return (
        <ChatbotWidget data={parsed.data} slug={slug} business={business} tenantName={tenantName} />
      );
    default:
      return assertExhaustive(parsed);
  }
}

// Compile-time exhaustiveness: a module type added to the union without a case above no longer
// type-checks. At runtime the unreachable branch renders nothing.
function assertExhaustive(_unhandled: never): null {
  return null;
}
