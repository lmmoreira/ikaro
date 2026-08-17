// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  AboutModuleData,
  BookingCtaModuleData,
  ContactModuleData,
  FooterModuleData,
  GalleryModuleData,
  HeroModuleData,
  ServiceListModuleData,
  TestimonialsModuleData,
} from '@ikaro/types';
import type {
  HotsiteModuleParsed,
  HotsiteModuleRenderPlanItem,
} from '@/features/platform/hotsite/page-model';
import { renderHotsitePreviewModule } from './renderHotsitePreviewModule';

// Every child module is a real, independently-tested component with its own complex prop
// contract (business info, services, gallery items, etc.) — this file's own concern is purely
// which one gets picked for a given module type, so each is mocked to a recognizable marker
// rather than satisfied with realistic data.
vi.mock('@/shells/hotsite/components/HeroModule', () => ({
  HeroModule: () => <div data-testid="hero-module" />,
}));
vi.mock('@/shells/hotsite/components/ServiceListModule', () => ({
  ServiceListModule: () => <div data-testid="service-list-module" />,
}));
vi.mock('@/shells/hotsite/components/GalleryModule', () => ({
  GalleryModule: () => <div data-testid="gallery-module" />,
}));
vi.mock('@/shells/hotsite/components/BookingCtaModule', () => ({
  BookingCtaModule: () => <div data-testid="booking-cta-module" />,
}));
vi.mock('@/shells/hotsite/components/TestimonialsModule', () => ({
  TestimonialsModule: () => <div data-testid="testimonials-module" />,
}));
vi.mock('@/shells/hotsite/components/AboutModule', () => ({
  AboutModule: () => <div data-testid="about-module" />,
}));
vi.mock('@/shells/hotsite/components/ContactModule', () => ({
  ContactModule: () => <div data-testid="contact-module" />,
}));
vi.mock('@/shells/hotsite/components/Footer', () => ({
  Footer: () => <div data-testid="footer-module" />,
}));

const baseCtx = {
  tenantSlug: 'lavacar-bh',
  tenantBrand: { name: 'Lava Rápido BH' },
  logoUrl: '',
  data: {
    services: [],
    business: {
      phone: null,
      email: null,
      address: null,
      socialLinks: null,
    },
    tenantName: 'Lava Rápido BH',
  },
};

function planItem(parsed: HotsiteModuleParsed): HotsiteModuleRenderPlanItem {
  return { parsed, bgVariant: 'default' };
}

describe('renderHotsitePreviewModule', () => {
  it.each([
    ['HERO', 'hero-module', {} as HeroModuleData],
    ['SERVICE_LIST', 'service-list-module', {} as ServiceListModuleData],
    ['CONTACT', 'contact-module', {} as ContactModuleData],
    ['BOOKING_CTA', 'booking-cta-module', {} as BookingCtaModuleData],
    ['GALLERY', 'gallery-module', {} as GalleryModuleData],
    ['TESTIMONIALS', 'testimonials-module', {} as TestimonialsModuleData],
    ['ABOUT', 'about-module', {} as AboutModuleData],
    ['FOOTER', 'footer-module', {} as FooterModuleData],
  ] as const)('renders the %s module for a %s plan item', (type, testId, data) => {
    const result = renderHotsitePreviewModule(
      planItem({ type, data } as HotsiteModuleParsed),
      0,
      baseCtx,
    );

    render(<>{result}</>);
    expect(screen.getByTestId(testId)).toBeInTheDocument();
  });

  it('returns null for a module type with no preview renderer (e.g. CHATBOT)', () => {
    const result = renderHotsitePreviewModule(
      planItem({ type: 'CHATBOT', data: {} } as unknown as HotsiteModuleParsed),
      0,
      baseCtx,
    );

    expect(result).toBeNull();
  });
});
