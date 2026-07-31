// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { axe } from '@/axe-helper';
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

  describe('responsive crop (M18-S04)', () => {
    it('centered variant uses a vw-relative min-height at every breakpoint, never a vh-relative one', () => {
      const { container } = render(<HeroModule data={makeData()} slug="tenant" />);

      const section = container.querySelector('[data-variant="centered"]');
      expect(section?.className).toContain('min-h-[42.86vw]');
      expect(section?.className).toContain('sm:min-h-[31.25vw]');
      expect(section?.className).not.toContain('min-h-screen');
      // A vh-based floor stays fixed as the window narrows (only the container's width
      // shrinks), so cropping gets progressively worse at every width in between — not just
      // full desktop and true-mobile. Guards against reintroducing that class of bug.
      expect(section?.className).not.toMatch(/\bmin-h-\[\d+vh\]/);
    });

    it('left-aligned right-panel image uses aspect-[21/9] on mobile and the existing sm: height classes, never h-64', () => {
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

      const imgWrapper = container.querySelector('img')?.parentElement;
      expect(imgWrapper?.className).toContain('aspect-[21/9]');
      expect(imgWrapper?.className).toContain('sm:aspect-auto');
      expect(imgWrapper?.className).toContain('sm:h-full');
      expect(imgWrapper?.className).toContain('sm:min-h-[15.6vw]');
      expect(imgWrapper?.className).not.toContain('h-64');
      expect(imgWrapper?.className).not.toMatch(/\bmin-h-\[\d+vh\]/);
    });

    // Cross-tool review finding (Codex, PR #294): the earlier vh-guard assertions above only
    // checked the image wrapper, missing the *outer* left-aligned section — which still had
    // min-h-screen sm:min-h-[60vh] at the time. Asserted separately so this specific element is
    // never missed again.
    it("left-aligned variant's outer section uses a vw-relative min-height, never min-h-screen or any vh unit", () => {
      const { container } = render(
        <HeroModule data={makeData({ variant: 'left-aligned' })} slug="tenant" />,
      );

      const section = container.querySelector('[data-variant="left-aligned"]');
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
          <HeroModule
            data={makeData({
              backgroundImageUrl: 'https://storage.example.com/hero.jpg',
              backgroundImagePosition,
            })}
            slug="tenant"
          />,
        );

        expect(container.querySelector('img')?.style.objectPosition).toBe(expected);
      },
    );

    it('centered variant defaults objectPosition to "center center" when backgroundImagePosition is absent', () => {
      const { container } = render(
        <HeroModule
          data={makeData({ backgroundImageUrl: 'https://storage.example.com/hero.jpg' })}
          slug="tenant"
        />,
      );

      expect(container.querySelector('img')?.style.objectPosition).toBe('center center');
    });

    it('left-aligned right-panel image applies objectPosition from backgroundImagePosition', () => {
      const { container } = render(
        <HeroModule
          data={makeData({
            variant: 'left-aligned',
            backgroundImageUrl: 'https://storage.example.com/hero.jpg',
            rightPanel: 'image',
            backgroundImagePosition: 'right',
          })}
          slug="tenant"
        />,
      );

      expect(container.querySelector('img')?.style.objectPosition).toBe('right center');
    });
  });

  describe('content position (M18-S05)', () => {
    it('centered variant: absent contentPositionX/Y renders identically to before this field existed', () => {
      const { container } = render(<HeroModule data={makeData()} slug="tenant" />);

      const section = container.querySelector('[data-variant="centered"]');
      expect(section?.className).toContain('items-center');
      expect(section?.className).toContain('justify-center');

      const wrapper = container.querySelector('[data-variant="centered"] > div');
      expect(wrapper?.className).toContain('mx-auto');
      expect(wrapper?.className).toContain('text-center');

      // The CTA row had no justify-content class at all before this field existed (flex
      // defaults to flex-start) — must stay that way when contentPositionX is unset, since the
      // section/wrapper's explicit 'center' defaults above pre-date this field and the CTA row's
      // implicit default does not (see HeroModule.tsx's comment on ctaJustifyClass).
      const ctaRow = screen.getByRole('link', { name: 'Agendar agora' }).parentElement;
      expect(ctaRow?.className).not.toMatch(/justify-(start|center|end)/);
    });

    it('left-aligned variant: absent contentPositionY renders identically to before this field existed', () => {
      const { container } = render(
        <HeroModule data={makeData({ variant: 'left-aligned' })} slug="tenant" />,
      );

      const section = container.querySelector('[data-variant="left-aligned"]');
      expect(section?.className).toContain('items-center');
    });

    it.each([
      ['left', 'justify-start', 'text-left'],
      ['center', 'justify-center', 'text-center'],
      ['right', 'justify-end', 'text-right'],
    ] as const)(
      'centered variant: contentPositionX %s drives section justify, wrapper alignment, and CTA row justify',
      (contentPositionX, expectedJustify, expectedTextAlign) => {
        const { container } = render(
          <HeroModule data={makeData({ contentPositionX })} slug="tenant" />,
        );

        const section = container.querySelector('[data-variant="centered"]');
        expect(section?.className).toContain(expectedJustify);

        const wrapper = container.querySelector('[data-variant="centered"] > div');
        expect(wrapper?.className).toContain(expectedTextAlign);

        const ctaRow = screen.getByRole('link', { name: 'Agendar agora' }).parentElement;
        expect(ctaRow?.className).toContain(expectedJustify);
      },
    );

    it('centered variant: contentPositionX "left" removes the auto-centering margin', () => {
      const { container } = render(
        <HeroModule data={makeData({ contentPositionX: 'left' })} slug="tenant" />,
      );

      const wrapper = container.querySelector('[data-variant="centered"] > div');
      expect(wrapper?.className).not.toContain('mx-auto');
      expect(wrapper?.className).not.toContain('ml-auto');
    });

    it('centered variant: contentPositionX "right" applies ml-auto instead of mx-auto', () => {
      const { container } = render(
        <HeroModule data={makeData({ contentPositionX: 'right' })} slug="tenant" />,
      );

      const wrapper = container.querySelector('[data-variant="centered"] > div');
      expect(wrapper?.className).toContain('ml-auto');
      expect(wrapper?.className).not.toContain('mx-auto');
    });

    it.each([
      ['top', 'items-start'],
      ['center', 'items-center'],
      ['bottom', 'items-end'],
    ] as const)(
      'centered variant: contentPositionY %s drives section items alignment',
      (contentPositionY, expectedItems) => {
        const { container } = render(
          <HeroModule data={makeData({ contentPositionY })} slug="tenant" />,
        );

        const section = container.querySelector('[data-variant="centered"]');
        expect(section?.className).toContain(expectedItems);
      },
    );

    it.each([
      ['top', 'items-start'],
      ['center', 'items-center'],
      ['bottom', 'items-end'],
    ] as const)(
      'left-aligned variant: contentPositionY %s drives outer section items alignment',
      (contentPositionY, expectedItems) => {
        const { container } = render(
          <HeroModule
            data={makeData({ variant: 'left-aligned', contentPositionY })}
            slug="tenant"
          />,
        );

        const section = container.querySelector('[data-variant="left-aligned"]');
        expect(section?.className).toContain(expectedItems);
      },
    );

    it('left-aligned variant: contentPositionX has no rendering effect', () => {
      const { container } = render(
        <HeroModule
          data={makeData({ variant: 'left-aligned', contentPositionX: 'right' })}
          slug="tenant"
        />,
      );

      const section = container.querySelector('[data-variant="left-aligned"]');
      expect(section?.className).not.toMatch(/justify-(start|center|end)/);
    });
  });

  it('has no axe violations', async () => {
    const { container } = render(<HeroModule data={makeData()} slug="tenant" />);

    expect(await axe(container)).toHaveNoViolations();
  });
});
