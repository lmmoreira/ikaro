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

  describe('content position (M18-S05)', () => {
    it('centered variant (default): absent contentPositionX/Y renders identically to before this field existed', () => {
      const { container } = render(<BookingCtaModule data={makeData()} slug="lavacar-beloauto" />);

      const section = container.querySelector('section#booking-form');
      expect(section?.className).toContain('items-center');
      expect(section?.className).toContain('justify-center');

      const wrapper = container.querySelector('section#booking-form > div');
      expect(wrapper?.className).toContain('mx-auto');
      expect(wrapper?.className).toContain('text-center');
    });

    it('left-aligned variant: absent contentPositionY renders identically to before this field existed', () => {
      const { container } = render(
        <BookingCtaModule data={makeData({ variant: 'left-aligned' })} slug="lavacar-beloauto" />,
      );

      const section = container.querySelector('section#booking-form');
      expect(section?.className).toContain('items-center');
    });

    it.each([
      ['left', 'justify-start', 'text-left'],
      ['center', 'justify-center', 'text-center'],
      ['right', 'justify-end', 'text-right'],
    ] as const)(
      'centered variant: contentPositionX %s drives section justify and wrapper alignment',
      (contentPositionX, expectedJustify, expectedTextAlign) => {
        const { container } = render(
          <BookingCtaModule data={makeData({ contentPositionX })} slug="lavacar-beloauto" />,
        );

        const section = container.querySelector('section#booking-form');
        expect(section?.className).toContain(expectedJustify);

        const wrapper = container.querySelector('section#booking-form > div');
        expect(wrapper?.className).toContain(expectedTextAlign);
      },
    );

    it('centered variant: contentPositionX "left" removes the auto-centering margin', () => {
      const { container } = render(
        <BookingCtaModule data={makeData({ contentPositionX: 'left' })} slug="lavacar-beloauto" />,
      );

      const wrapper = container.querySelector('section#booking-form > div');
      expect(wrapper?.className).not.toContain('mx-auto');
      expect(wrapper?.className).not.toContain('ml-auto');
    });

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
      'left-aligned variant: contentPositionY %s drives section items alignment',
      (contentPositionY, expectedItems) => {
        const { container } = render(
          <BookingCtaModule
            data={makeData({ variant: 'left-aligned', contentPositionY })}
            slug="lavacar-beloauto"
          />,
        );

        const section = container.querySelector('section#booking-form');
        expect(section?.className).toContain(expectedItems);
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
