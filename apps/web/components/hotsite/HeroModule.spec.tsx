// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { HeroModuleData } from '@beloauto/types';
import { HeroModule } from './HeroModule';

function makeData(overrides?: Partial<HeroModuleData>): HeroModuleData {
  return {
    variant: 'centered',
    title: 'Bem-vindo à Lavacar',
    ctaLabel: 'Agendar agora',
    ctaTarget: 'booking',
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

    it('CTA href targets #booking-form when ctaTarget is booking', () => {
      render(<HeroModule data={makeData({ ctaTarget: 'booking' })} slug="tenant" />);

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

  describe('CTA hover-fill styling', () => {
    it('CTA includes a hover background-fill class referencing --ba-btn-hover-bg', () => {
      render(<HeroModule data={makeData()} slug="tenant" />);

      expect(screen.getByRole('link', { name: 'Agendar agora' }).className).toContain(
        'hover:bg-[var(--ba-btn-hover-bg)]',
      );
    });
  });

  describe('background image', () => {
    it('renders img with correct src when backgroundImageUrl is provided', () => {
      const { container } = render(
        <HeroModule
          data={makeData({ backgroundImageUrl: 'https://storage.example.com/hero.jpg' })}
          slug="tenant"
        />,
      );

      // alt="" marks the image as decorative (ARIA role="presentation") — query by tag
      const img = container.querySelector('img');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', 'https://storage.example.com/hero.jpg');
    });

    it('does not render img when backgroundImageUrl is absent', () => {
      const { container } = render(<HeroModule data={makeData()} slug="tenant" />);

      expect(container.querySelector('img')).not.toBeInTheDocument();
    });
  });
});
