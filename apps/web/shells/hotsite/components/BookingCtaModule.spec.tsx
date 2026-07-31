// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { axe } from '@/axe-helper';
import { describe, expect, it } from 'vitest';
import type { BookingCtaModuleData } from '@ikaro/types';
import { BookingCtaModule } from './BookingCtaModule';

function makeData(overrides?: Partial<BookingCtaModuleData>): BookingCtaModuleData {
  return {
    title: 'Agende seu horário',
    ctaLabel: 'Agendar agora',
    ...overrides,
  };
}

describe('BookingCtaModule', () => {
  it('renders title and CTA link to the booking page', () => {
    render(<BookingCtaModule data={makeData()} slug="lavacar-beloauto" />);

    expect(screen.getByRole('heading', { name: 'Agende seu horário' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Agendar agora' })).toHaveAttribute(
      'href',
      '/lavacar-beloauto/booking',
    );
  });

  it('renders a section with id="booking-form"', () => {
    const { container } = render(<BookingCtaModule data={makeData()} slug="lavacar-beloauto" />);

    expect(container.querySelector('section#booking-form')).toBeInTheDocument();
  });

  it('renders subtitle when provided', () => {
    render(
      <BookingCtaModule
        data={makeData({ subtitle: 'Vagas limitadas para hoje' })}
        slug="lavacar-beloauto"
      />,
    );

    expect(screen.getByText('Vagas limitadas para hoje')).toBeInTheDocument();
  });

  it('does not render subtitle element when absent', () => {
    const { container } = render(<BookingCtaModule data={makeData()} slug="lavacar-beloauto" />);

    expect(container.querySelector('[data-testid="booking-cta-subtitle"]')).not.toBeInTheDocument();
  });

  it('renders img with correct src when backgroundImageUrl is provided', () => {
    const { container } = render(
      <BookingCtaModule
        data={makeData({ backgroundImageUrl: 'https://storage.example.com/cta.jpg' })}
        slug="lavacar-beloauto"
      />,
    );

    const img = container.querySelector('img');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://storage.example.com/cta.jpg');
  });

  it('does not render img when backgroundImageUrl is absent', () => {
    const { container } = render(<BookingCtaModule data={makeData()} slug="lavacar-beloauto" />);

    expect(container.querySelector('img')).not.toBeInTheDocument();
  });

  describe('eyebrow', () => {
    it('renders eyebrow when provided', () => {
      render(
        <BookingCtaModule data={makeData({ eyebrow: 'Reserve agora' })} slug="lavacar-beloauto" />,
      );

      expect(screen.getByTestId('section-eyebrow')).toHaveTextContent('Reserve agora');
    });

    it('does not render eyebrow when absent', () => {
      const { container } = render(<BookingCtaModule data={makeData()} slug="lavacar-beloauto" />);

      expect(container.querySelector('[data-testid="section-eyebrow"]')).not.toBeInTheDocument();
    });
  });

  describe('rightPanel brand-card', () => {
    it('renders brand card when rightPanel is "brand-card" and tenantBrand is provided', () => {
      render(
        <BookingCtaModule
          data={makeData({ variant: 'left-aligned', rightPanel: 'brand-card' })}
          slug="lavacar-beloauto"
          tenantBrand={{ name: 'BELOAUTO', tagline: 'Estética Automotiva' }}
        />,
      );

      expect(screen.getByTestId('booking-cta-brand-card')).toBeInTheDocument();
    });

    it('does not render brand card when tenantBrand is absent', () => {
      const { container } = render(
        <BookingCtaModule
          data={makeData({ variant: 'left-aligned', rightPanel: 'brand-card' })}
          slug="lavacar-beloauto"
        />,
      );

      expect(
        container.querySelector('[data-testid="booking-cta-brand-card"]'),
      ).not.toBeInTheDocument();
    });
  });

  describe('responsive crop (M18-S04 treatment, applied here in M18-S05)', () => {
    it('centered variant uses a vw-relative min-height at every breakpoint, never a vh-relative one', () => {
      const { container } = render(<BookingCtaModule data={makeData()} slug="lavacar-beloauto" />);

      const section = container.querySelector('section#booking-form');
      expect(section?.className).toContain('min-h-[42.86vw]');
      expect(section?.className).toContain('sm:min-h-[31.25vw]');
      expect(section?.className).not.toContain('min-h-[40vh]');
      expect(section?.className).not.toMatch(/\bmin-h-\[\d+vh\]/);
    });

    it('left-aligned right-panel image uses aspect-[21/9] on mobile and the existing sm: height classes, never h-64', () => {
      const { container } = render(
        <BookingCtaModule
          data={makeData({
            variant: 'left-aligned',
            backgroundImageUrl: 'https://storage.example.com/cta.jpg',
          })}
          slug="lavacar-beloauto"
        />,
      );

      const imgWrapper = container.querySelector('img')?.parentElement;
      expect(imgWrapper?.className).toContain('aspect-[21/9]');
      expect(imgWrapper?.className).toContain('sm:aspect-auto');
      expect(imgWrapper?.className).toContain('sm:h-full');
      expect(imgWrapper?.className).toContain('sm:min-h-[15.6vw]');
      expect(imgWrapper?.className).not.toContain('h-64');
      expect(imgWrapper?.className).not.toMatch(/\bmin-h-\[\d+vh\]/);
    });

    it("left-aligned variant's outer section uses a vw-relative min-height, never min-h-screen or any vh unit", () => {
      const { container } = render(
        <BookingCtaModule data={makeData({ variant: 'left-aligned' })} slug="lavacar-beloauto" />,
      );

      const section = container.querySelector('section#booking-form');
      expect(section?.className).toContain('min-h-[31.25vw]');
      expect(section?.className).not.toContain('min-h-screen');
      expect(section?.className).not.toMatch(/\bmin-h-\[\d+vh\]/);
    });

    it.each([
      ['left', 'left center'],
      ['center', 'center center'],
      ['right', 'right center'],
    ] as const)(
      'centered variant applies objectPosition %s as "%s"',
      (backgroundImagePosition, expected) => {
        const { container } = render(
          <BookingCtaModule
            data={makeData({
              backgroundImageUrl: 'https://storage.example.com/cta.jpg',
              backgroundImagePosition,
            })}
            slug="lavacar-beloauto"
          />,
        );

        expect(container.querySelector('img')?.style.objectPosition).toBe(expected);
      },
    );

    it('centered variant defaults objectPosition to "center center" when backgroundImagePosition is absent', () => {
      const { container } = render(
        <BookingCtaModule
          data={makeData({ backgroundImageUrl: 'https://storage.example.com/cta.jpg' })}
          slug="lavacar-beloauto"
        />,
      );

      expect(container.querySelector('img')?.style.objectPosition).toBe('center center');
    });

    it('left-aligned right-panel image applies objectPosition from backgroundImagePosition', () => {
      const { container } = render(
        <BookingCtaModule
          data={makeData({
            variant: 'left-aligned',
            backgroundImageUrl: 'https://storage.example.com/cta.jpg',
            backgroundImagePosition: 'right',
          })}
          slug="lavacar-beloauto"
        />,
      );

      expect(container.querySelector('img')?.style.objectPosition).toBe('right center');
    });
  });

  describe('content position (M18-S05)', () => {
    it('centered variant (default): absent contentPositionX/Y renders identically to before this field existed', () => {
      const { container } = render(<BookingCtaModule data={makeData()} slug="lavacar-beloauto" />);

      const section = container.querySelector('section#booking-form');
      expect(section?.className).toContain('items-center');
      // justify-content moved from the section to the stage div (see the stage tests below) —
      // the section itself no longer carries a justify-* class at all.
      expect(section?.className).not.toMatch(/justify-(start|center|end)/);

      const stage = container.querySelector('section#booking-form > div');
      expect(stage?.className).toContain('max-w-7xl');
      expect(stage?.className).toContain('mx-auto');
      expect(stage?.className).toContain('justify-center');

      const wrapper = container.querySelector('section#booking-form > div > div');
      expect(wrapper?.className).toContain('text-center');
    });

    it('left-aligned variant: absent contentPositionY renders identically to before this field existed', () => {
      const { container } = render(
        <BookingCtaModule data={makeData({ variant: 'left-aligned' })} slug="lavacar-beloauto" />,
      );

      // The outer section's own alignment is fixed (always items-center) — Y drives the grid's
      // cross-axis alignment instead (cross-tool review finding, PR #295, same reasoning as
      // HeroModule.spec.tsx).
      const section = container.querySelector('section#booking-form');
      expect(section?.className).toContain('items-center');

      const grid = container.querySelector('section#booking-form .grid');
      expect(grid?.className).toContain('items-center');
    });

    it.each([
      ['left', 'justify-start', 'text-left'],
      ['center', 'justify-center', 'text-center'],
      ['right', 'justify-end', 'text-right'],
    ] as const)(
      'centered variant: contentPositionX %s drives stage justify and wrapper alignment — stage always stays within max-w-7xl',
      (contentPositionX, expectedJustify, expectedTextAlign) => {
        const { container } = render(
          <BookingCtaModule data={makeData({ contentPositionX })} slug="lavacar-beloauto" />,
        );

        const stage = container.querySelector('section#booking-form > div');
        expect(stage?.className).toContain(expectedJustify);
        // Regression guard (M18-S05 follow-up fix) — same reasoning as HeroModule.spec.tsx.
        expect(stage?.className).toContain('max-w-7xl');
        expect(stage?.className).toContain('mx-auto');

        const wrapper = container.querySelector('section#booking-form > div > div');
        expect(wrapper?.className).toContain(expectedTextAlign);
      },
    );

    // Combined X × Y coverage (cross-tool review, PR #295) — same reasoning as
    // HeroModule.spec.tsx: X and Y are orthogonal properties on different elements, so this
    // exercises all 9 pairs directly rather than leaving it as an inference from two suites.
    it.each([
      ['left', 'top', 'justify-start', 'items-start'],
      ['left', 'center', 'justify-start', 'items-center'],
      ['left', 'bottom', 'justify-start', 'items-end'],
      ['center', 'top', 'justify-center', 'items-start'],
      ['center', 'center', 'justify-center', 'items-center'],
      ['center', 'bottom', 'justify-center', 'items-end'],
      ['right', 'top', 'justify-end', 'items-start'],
      ['right', 'center', 'justify-end', 'items-center'],
      ['right', 'bottom', 'justify-end', 'items-end'],
    ] as const)(
      'centered variant: contentPositionX %s + contentPositionY %s together produce %s + %s on the stage/section',
      (contentPositionX, contentPositionY, expectedJustify, expectedItems) => {
        const { container } = render(
          <BookingCtaModule
            data={makeData({ contentPositionX, contentPositionY })}
            slug="lavacar-beloauto"
          />,
        );

        const section = container.querySelector('section#booking-form');
        expect(section?.className).toContain(expectedItems);

        const stage = container.querySelector('section#booking-form > div');
        expect(stage?.className).toContain(expectedJustify);
      },
    );

    it.each([
      ['top', 'items-start'],
      ['center', 'items-center'],
      ['bottom', 'items-end'],
    ] as const)(
      'centered variant: contentPositionY %s drives section items alignment',
      (contentPositionY, expectedItems) => {
        const { container } = render(
          <BookingCtaModule data={makeData({ contentPositionY })} slug="lavacar-beloauto" />,
        );

        const section = container.querySelector('section#booking-form');
        expect(section?.className).toContain(expectedItems);
      },
    );

    it.each([
      ['top', 'items-start'],
      ['center', 'items-center'],
      ['bottom', 'items-end'],
    ] as const)(
      'left-aligned variant: contentPositionY %s drives the grid row alignment (text column vs. image/brand-card column)',
      (contentPositionY, expectedItems) => {
        const { container } = render(
          <BookingCtaModule
            data={makeData({
              variant: 'left-aligned',
              contentPositionY,
              backgroundImageUrl: 'https://storage.example.com/cta.jpg',
            })}
            slug="lavacar-beloauto"
          />,
        );

        const grid = container.querySelector('section#booking-form .grid');
        expect(grid?.className).toContain(expectedItems);
      },
    );

    it('left-aligned variant: contentPositionX has no rendering effect', () => {
      const { container } = render(
        <BookingCtaModule
          data={makeData({ variant: 'left-aligned', contentPositionX: 'right' })}
          slug="lavacar-beloauto"
        />,
      );

      const section = container.querySelector('section#booking-form');
      expect(section?.className).not.toMatch(/justify-(start|center|end)/);
    });
  });

  it('has no axe violations', async () => {
    const { container } = render(<BookingCtaModule data={makeData()} slug="lavacar-beloauto" />);

    expect(await axe(container)).toHaveNoViolations();
  });
});
