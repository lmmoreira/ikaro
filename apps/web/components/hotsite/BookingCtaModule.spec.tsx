// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
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

  it('has no axe violations', async () => {
    const { container } = render(<BookingCtaModule data={makeData()} slug="lavacar-beloauto" />);

    expect(await axe(container)).toHaveNoViolations();
  });
});
