// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { HotsiteModuleType } from '@ikaro/types';
import { MODULE_ORDER } from '@/features/platform/hotsite/default-layout';
import type {
  HotsiteModuleParsed,
  HotsiteModuleRenderPlanItem,
} from '@/features/platform/hotsite/page-model';
import { HotsiteModuleView, type HotsiteModuleViewProps } from './HotsiteModuleView';

// Each module is its own tested component; this file only pins which one a plan item selects and
// what it is handed.
const received = vi.hoisted(() => ({}) as Record<string, Record<string, unknown>>);

function marker(testId: string) {
  return (props: Record<string, unknown>) => {
    received[testId] = props;
    return <div data-testid={testId} />;
  };
}

vi.mock('./HeroModule', () => ({ HeroModule: marker('hero') }));
vi.mock('./ServiceListModule', () => ({ ServiceListModule: marker('service-list') }));
vi.mock('./GalleryModule', () => ({ GalleryModule: marker('gallery') }));
vi.mock('./TestimonialsModule', () => ({ TestimonialsModule: marker('testimonials') }));
vi.mock('./BookingCtaModule', () => ({ BookingCtaModule: marker('booking-cta') }));
vi.mock('./AboutModule', () => ({ AboutModule: marker('about') }));
vi.mock('./ContentBlockModule', () => ({ ContentBlockModule: marker('content-block') }));
vi.mock('./ContactModule', () => ({ ContactModule: marker('contact') }));
vi.mock('./LeadFormModule', () => ({ LeadFormModule: marker('lead-form') }));
vi.mock('./Footer', () => ({ Footer: marker('footer') }));
vi.mock('./ChatbotWidget', () => ({ ChatbotWidget: marker('chatbot') }));

// Every canonical module type and the marker it must render. NAVIGATION is page chrome and renders
// nothing here. A type missing from this table fails the coverage test below.
const EXPECTED: Readonly<Record<HotsiteModuleType, string | null>> = {
  NAVIGATION: null,
  HERO: 'hero',
  SERVICE_LIST: 'service-list',
  GALLERY: 'gallery',
  TESTIMONIALS: 'testimonials',
  BOOKING_CTA: 'booking-cta',
  ABOUT: 'about',
  CONTENT_BLOCK: 'content-block',
  CONTACT: 'contact',
  FOOTER: 'footer',
  CHATBOT: 'chatbot',
  LEAD_FORM: 'lead-form',
};

const baseProps: Omit<HotsiteModuleViewProps, 'item'> = {
  slug: 'lavacar-bh',
  tenantName: 'Lava Rápido BH',
  tenantBrand: { name: 'Lava Rápido BH' },
  logoUrl: 'https://cdn.example.com/logo.png',
  business: { phone: null, email: null, address: null, socialLinks: null },
  services: [],
};

function item(parsed: unknown, extra: Partial<HotsiteModuleRenderPlanItem> = {}) {
  return { parsed: parsed as HotsiteModuleParsed, bgVariant: 'default', ...extra } as const;
}

describe('HotsiteModuleView', () => {
  it('handles every canonical hotsite module type (the public page and the preview share this)', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...MODULE_ORDER].sort());
  });

  it.each(Object.entries(EXPECTED))('renders %s as %s', (type, testId) => {
    const { container } = render(
      <HotsiteModuleView {...baseProps} item={item({ type, data: {} })} />,
    );

    if (testId === null) {
      expect(container).toBeEmptyDOMElement();
    } else {
      expect(screen.getByTestId(testId)).toBeInTheDocument();
    }
  });

  it('renders nothing for an unknown type', () => {
    const { container } = render(
      <HotsiteModuleView {...baseProps} item={item({ type: 'NOPE', data: {} })} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('hands a flow module its bgVariant, presentation and section tokens', () => {
    const presentation = { surface: 'primary' } as const;
    const sectionTokens = {
      '--ba-section-bg': '#111111',
      '--ba-section-text': '#FFFFFF',
      '--ba-section-card-bg': '#222222',
      '--ba-section-divider': '#333333',
    } as const;
    render(
      <HotsiteModuleView
        {...baseProps}
        item={item(
          { type: 'GALLERY', data: {} },
          { bgVariant: 'alt', presentation, sectionTokens },
        )}
      />,
    );

    expect(received.gallery).toMatchObject({
      slug: 'lavacar-bh',
      bgVariant: 'alt',
      presentation,
      sectionTokens,
    });
  });

  it('hands the service list the live services and the footer the tenant identity', () => {
    const services = [{ id: 's1' }] as unknown as HotsiteModuleViewProps['services'];
    render(
      <HotsiteModuleView
        {...baseProps}
        services={services}
        item={item({ type: 'SERVICE_LIST', data: {} })}
      />,
    );
    render(<HotsiteModuleView {...baseProps} item={item({ type: 'FOOTER', data: {} })} />);

    expect(received['service-list'].services).toBe(services);
    expect(received.footer).toMatchObject({
      tenantName: 'Lava Rápido BH',
      logoUrl: 'https://cdn.example.com/logo.png',
    });
  });
});
