// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { HeroModuleData } from '@ikaro/types';
import { HeroModule } from './HeroModule';

function makeData(overrides?: Partial<HeroModuleData>): HeroModuleData {
  return {
    variant: 'centered',
    title: 'Bem-vindo à Lavacar',
    ctaLabel: 'Agendar agora',
    ctaTarget: 'booking-form',
    ...overrides,
  };
}

describe('HeroModule', () => {
  describe('centered variant', () => {
    it('renders title and CTA button', () => {
      render(<HeroModule data={makeData()} slug="tenant" />);

      expect(screen.getByRole('heading', { name: 'Bem-vindo à Lavacar' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Agendar agora' })).toBeInTheDocument();
    });

    it('applies centered layout marker', () => {
      const { container } = render(<HeroModule data={makeData()} slug="tenant" />);

      expect(container.querySelector('[data-variant="centered"]')).toBeInTheDocument();
    });

    it('CTA href targets #booking-form when ctaTarget is booking-form', () => {
      render(<HeroModule data={makeData({ ctaTarget: 'booking-form' })} slug="tenant" />);

      expect(screen.getByRole('link', { name: 'Agendar agora' })).toHaveAttribute(
        'href',
        '#booking-form',
      );
    });

    it('CTA href targets #service-list when ctaTarget is service-list', () => {
      render(
        <HeroModule
          data={makeData({ ctaTarget: 'service-list', ctaLabel: 'Ver serviços' })}
          slug="tenant"
        />,
      );

      expect(screen.getByRole('link', { name: 'Ver serviços' })).toHaveAttribute(
        'href',
        '#service-list',
      );
    });
  });

  describe('left-aligned variant', () => {
    it('renders title and CTA button', () => {
      render(<HeroModule data={makeData({ variant: 'left-aligned' })} slug="tenant" />);

      expect(screen.getByRole('heading', { name: 'Bem-vindo à Lavacar' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Agendar agora' })).toBeInTheDocument();
    });

    it('applies left-aligned layout marker', () => {
      const { container } = render(
        <HeroModule data={makeData({ variant: 'left-aligned' })} slug="tenant" />,
      );

      expect(container.querySelector('[data-variant="left-aligned"]')).toBeInTheDocument();
    });
  });

  describe('subtitle', () => {
    it('renders subtitle when provided', () => {
      render(
        <HeroModule data={makeData({ subtitle: 'O melhor serviço da cidade' })} slug="tenant" />,
      );

      expect(screen.getByText('O melhor serviço da cidade')).toBeInTheDocument();
    });

    it('does not render subtitle element when absent', () => {
      const { container } = render(<HeroModule data={makeData()} slug="tenant" />);

      expect(container.querySelector('[data-testid="hero-subtitle"]')).not.toBeInTheDocument();
    });
  });

  describe('eyebrow', () => {
    it('renders eyebrow text when provided', () => {
      render(<HeroModule data={makeData({ eyebrow: 'Estética premium' })} slug="tenant" />);

      expect(screen.getByTestId('section-eyebrow')).toHaveTextContent('Estética premium');
    });

    it('does not render eyebrow when absent', () => {
      const { container } = render(<HeroModule data={makeData()} slug="tenant" />);

      expect(container.querySelector('[data-testid="section-eyebrow"]')).not.toBeInTheDocument();
    });
  });

  describe('secondary CTA', () => {
    it('renders secondary CTA when secondaryCtaLabel and secondaryCtaTarget are provided', () => {
      render(
        <HeroModule
          data={makeData({ secondaryCtaLabel: 'Ver serviços', secondaryCtaTarget: 'service-list' })}
          slug="tenant"
        />,
      );

      const secondaryCta = screen.getByTestId('hero-secondary-cta');
      expect(secondaryCta).toHaveTextContent('Ver serviços');
      expect(secondaryCta).toHaveAttribute('href', '#service-list');
    });

    it('does not render secondary CTA when secondaryCtaLabel is absent', () => {
      const { container } = render(<HeroModule data={makeData()} slug="tenant" />);

      expect(container.querySelector('[data-testid="hero-secondary-cta"]')).not.toBeInTheDocument();
    });
  });

  describe('rightPanel', () => {
    it('renders brand card when rightPanel is "brand-card" and tenantBrand is provided', () => {
      render(
        <HeroModule
          data={makeData({ variant: 'left-aligned', rightPanel: 'brand-card' })}
          slug="tenant"
          tenantBrand={{ name: 'BELOAUTO', tagline: 'Estética Automotiva' }}
        />,
      );

      expect(screen.getByTestId('brand-card')).toBeInTheDocument();
      expect(screen.getByTestId('brand-card')).toHaveTextContent('BELOAUTO');
      expect(screen.getByTestId('brand-card-tagline')).toHaveTextContent('Estética Automotiva');
    });

    it('does not render brand card when rightPanel is "brand-card" but tenantBrand is absent', () => {
      const { container } = render(
        <HeroModule
          data={makeData({ variant: 'left-aligned', rightPanel: 'brand-card' })}
          slug="tenant"
        />,
      );

      expect(container.querySelector('[data-testid="brand-card"]')).not.toBeInTheDocument();
    });

    it('renders brand card without tagline when tagline is absent', () => {
      render(
        <HeroModule
          data={makeData({ variant: 'left-aligned', rightPanel: 'brand-card' })}
          slug="tenant"
          tenantBrand={{ name: 'MY BUSINESS' }}
        />,
      );

      expect(screen.getByTestId('brand-card')).toHaveTextContent('MY BUSINESS');
      expect(screen.queryByTestId('brand-card-tagline')).not.toBeInTheDocument();
    });
  });

  describe('CTA hover-fill styling', () => {
    it('CTA includes a hover background-fill class referencing --ba-btn-hover-bg', () => {
      render(<HeroModule data={makeData()} slug="tenant" />);

      expect(screen.getByRole('link', { name: 'Agendar agora' }).className).toContain(
        'hover:bg-[var(--ba-btn-hover-bg)]',
      );
    });
  });

  describe('background image', () => {
    it('renders img with correct src when backgroundImageUrl is provided and rightPanel is "image"', () => {
      const { container } = render(
        <HeroModule
          data={makeData({
            variant: 'left-aligned',
            backgroundImageUrl: 'https://storage.example.com/hero.jpg',
            rightPanel: 'image',
          })}
          slug="tenant"
        />,
      );

      const img = container.querySelector('img');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', 'https://storage.example.com/hero.jpg');
    });

    it('defaults to showing image in right panel when backgroundImageUrl is provided and rightPanel is absent', () => {
      const { container } = render(
        <HeroModule
          data={makeData({
            variant: 'left-aligned',
            backgroundImageUrl: 'https://storage.example.com/hero.jpg',
          })}
          slug="tenant"
        />,
      );

      expect(container.querySelector('img')).toBeInTheDocument();
    });

    it('does not render img when backgroundImageUrl is absent', () => {
      const { container } = render(<HeroModule data={makeData()} slug="tenant" />);

      expect(container.querySelector('img')).not.toBeInTheDocument();
    });
  });
});
