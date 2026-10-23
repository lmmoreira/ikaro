// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import type {
  AboutModuleData,
  BookingCtaModuleData,
  ChatbotModuleData,
  ContactModuleData,
  ContentBlockModuleData,
  FooterModuleData,
  GalleryModuleData,
  HeroModuleData,
  LeadFormModuleData,
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
const heroProps = vi.hoisted(() => [] as unknown[]);
vi.mock('@/shells/hotsite/components/HeroModule', () => ({
  HeroModule: (props: unknown) => {
    heroProps.push(props);
    return <div data-testid="hero-module" />;
  },
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
vi.mock('@/shells/hotsite/components/ChatbotWidget', () => ({
  ChatbotWidget: () => <div data-testid="chatbot-module" />,
}));
vi.mock('@/shells/hotsite/components/LeadFormModule', () => ({
  LeadFormModule: () => <div data-testid="lead-form-module" />,
}));
vi.mock('@/shells/hotsite/components/ContentBlockModule', () => ({
  ContentBlockModule: () => <div data-testid="content-block-module" />,
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
  // Negative guarantee: NAVIGATION is page chrome rendered by the top bar, never a section — an
  // enabled one reaching the preview renderer must stay invisible.
  it('renders nothing for an enabled NAVIGATION plan item', () => {
    const result = renderHotsitePreviewModule(
      planItem({ type: 'NAVIGATION', data: { items: [] } }),
      0,
      baseCtx,
    );

    const { container } = render(<>{result}</>);
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ['HERO', 'hero-module', {} as HeroModuleData],
    ['SERVICE_LIST', 'service-list-module', {} as ServiceListModuleData],
    ['CONTACT', 'contact-module', {} as ContactModuleData],
    ['BOOKING_CTA', 'booking-cta-module', {} as BookingCtaModuleData],
    ['GALLERY', 'gallery-module', {} as GalleryModuleData],
    ['TESTIMONIALS', 'testimonials-module', {} as TestimonialsModuleData],
    ['ABOUT', 'about-module', {} as AboutModuleData],
    ['FOOTER', 'footer-module', {} as FooterModuleData],
    ['CHATBOT', 'chatbot-module', {} as ChatbotModuleData],
    ['LEAD_FORM', 'lead-form-module', {} as LeadFormModuleData],
    ['CONTENT_BLOCK', 'content-block-module', {} as ContentBlockModuleData],
  ] as const)('renders the %s module for a %s plan item', (type, testId, data) => {
    const result = renderHotsitePreviewModule(
      planItem({ type, data } as HotsiteModuleParsed),
      0,
      baseCtx,
    );

    render(<>{result}</>);
    expect(screen.getByTestId(testId)).toBeInTheDocument();
  });

  it('renders nothing for an unknown module type', () => {
    const result = renderHotsitePreviewModule(
      planItem({ type: 'NOT_A_REAL_TYPE', data: {} } as unknown as HotsiteModuleParsed),
      0,
      baseCtx,
    );

    const { container } = render(<>{result}</>);
    expect(container).toBeEmptyDOMElement();
  });

  describe('with an editor selection', () => {
    const selection = { selectedType: null, onSelect: vi.fn() };
    const ALL_TYPES = [
      ['HERO', 'hero-module'],
      ['SERVICE_LIST', 'service-list-module'],
      ['CONTACT', 'contact-module'],
      ['BOOKING_CTA', 'booking-cta-module'],
      ['GALLERY', 'gallery-module'],
      ['TESTIMONIALS', 'testimonials-module'],
      ['ABOUT', 'about-module'],
      ['FOOTER', 'footer-module'],
      ['CHATBOT', 'chatbot-module'],
      ['LEAD_FORM', 'lead-form-module'],
      ['CONTENT_BLOCK', 'content-block-module'],
    ] as const;

    it.each(ALL_TYPES)(
      'wraps the %s module in a selectable section whose content is inert',
      async (type, testId) => {
        const result = renderHotsitePreviewModule(
          planItem({ type, data: {} } as HotsiteModuleParsed),
          0,
          { ...baseCtx, selection },
        );

        renderWithIntl(<>{result}</>);

        const section = screen.getByTestId('preview-section');
        expect(section).toHaveAttribute('data-module-type', type);
        expect(screen.getByTestId(testId).closest('[inert]')).not.toBeNull();
        expect(await screen.findByTestId('preview-section-select')).toHaveAttribute(
          'data-module-type',
          type,
        );
      },
    );

    it('renders no wrapper when there is no selection', () => {
      const result = renderHotsitePreviewModule(
        planItem({ type: 'HERO', data: {} } as HotsiteModuleParsed),
        0,
        baseCtx,
      );

      render(<>{result}</>);

      expect(screen.queryByTestId('preview-section')).not.toBeInTheDocument();
    });

    it('passes the module exactly the props it gets without a selection', () => {
      const item = planItem({ type: 'HERO', data: {} } as HotsiteModuleParsed);
      heroProps.length = 0;

      render(<>{renderHotsitePreviewModule(item, 0, baseCtx)}</>);
      renderWithIntl(<>{renderHotsitePreviewModule(item, 0, { ...baseCtx, selection })}</>);

      expect(heroProps).toHaveLength(2);
      expect(heroProps[1]).toEqual(heroProps[0]);
    });

    it('marks only the module matching the selected type', () => {
      const result = renderHotsitePreviewModule(
        planItem({ type: 'HERO', data: {} } as HotsiteModuleParsed),
        0,
        { ...baseCtx, selection: { selectedType: 'CONTACT', onSelect: vi.fn() } },
      );

      renderWithIntl(<>{result}</>);

      expect(screen.queryByTestId('preview-section-badge')).not.toBeInTheDocument();
    });

    it.each([
      ['an unset variant', {}, 'fixed'],
      ['the bubble variant', { variant: 'bubble' }, 'fixed'],
      ['the inline variant', { variant: 'inline' }, 'absolute'],
    ] as const)('pins the chatbot overlay for %s with the %s class', async (_label, data, cls) => {
      const result = renderHotsitePreviewModule(
        planItem({ type: 'CHATBOT', data } as HotsiteModuleParsed),
        0,
        { ...baseCtx, selection },
      );

      renderWithIntl(<>{result}</>);

      expect(await screen.findByTestId('preview-section-select')).toHaveClass(cls);
    });
  });
});
