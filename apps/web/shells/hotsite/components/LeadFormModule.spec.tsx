// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { axe } from '@/axe-helper';
import { describe, expect, it } from 'vitest';
import type { LeadFormModuleData } from '@ikaro/types';
import { LeadFormModule } from './LeadFormModule';

function makeData(overrides?: Partial<LeadFormModuleData>): LeadFormModuleData {
  return {
    title: 'Quer um orçamento personalizado?',
    ctaLabel: 'Falar com a gente',
    ...overrides,
  };
}

describe('LeadFormModule', () => {
  it('renders title and CTA link to the dedicated lead-form page', () => {
    render(<LeadFormModule data={makeData()} slug="lavacar-beloauto" />);

    expect(
      screen.getByRole('heading', { name: 'Quer um orçamento personalizado?' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Falar com a gente' })).toHaveAttribute(
      'href',
      '/lavacar-beloauto/lead-form',
    );
  });

  it('renders a section with id="lead-form"', () => {
    const { container } = render(<LeadFormModule data={makeData()} slug="lavacar-beloauto" />);

    expect(container.querySelector('section#lead-form')).toBeInTheDocument();
  });

  it('renders subtitle when provided', () => {
    render(
      <LeadFormModule
        data={makeData({ subtitle: 'Nossa equipe entra em contato em até 1 dia útil' })}
        slug="lavacar-beloauto"
      />,
    );

    expect(screen.getByText('Nossa equipe entra em contato em até 1 dia útil')).toBeInTheDocument();
  });

  it('does not render subtitle element when absent', () => {
    const { container } = render(<LeadFormModule data={makeData()} slug="lavacar-beloauto" />);

    expect(container.querySelector('[data-testid="lead-form-subtitle"]')).not.toBeInTheDocument();
  });

  it('renders img with correct src when backgroundImageUrl is provided', () => {
    const { container } = render(
      <LeadFormModule
        data={makeData({ backgroundImageUrl: 'https://storage.example.com/lead-form.jpg' })}
        slug="lavacar-beloauto"
      />,
    );

    const img = container.querySelector('img');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://storage.example.com/lead-form.jpg');
  });

  it('does not render img when backgroundImageUrl is absent', () => {
    const { container } = render(<LeadFormModule data={makeData()} slug="lavacar-beloauto" />);

    expect(container.querySelector('img')).not.toBeInTheDocument();
  });

  describe('eyebrow', () => {
    it('renders eyebrow when provided', () => {
      render(
        <LeadFormModule data={makeData({ eyebrow: 'Fale com a gente' })} slug="lavacar-beloauto" />,
      );

      expect(screen.getByTestId('section-eyebrow')).toHaveTextContent('Fale com a gente');
    });

    it('does not render eyebrow when absent', () => {
      const { container } = render(<LeadFormModule data={makeData()} slug="lavacar-beloauto" />);

      expect(container.querySelector('[data-testid="section-eyebrow"]')).not.toBeInTheDocument();
    });
  });

  describe('bgStyle', () => {
    it('defaults to var(--ba-primary) section background when bgStyle is absent', () => {
      const { container } = render(<LeadFormModule data={makeData()} slug="lavacar-beloauto" />);

      const section = container.querySelector('section#lead-form') as HTMLElement;
      expect(section.style.backgroundColor).toBe('var(--ba-primary)');
    });

    it('uses var(--ba-background) section background when bgStyle is "background"', () => {
      const { container } = render(
        <LeadFormModule data={makeData({ bgStyle: 'background' })} slug="lavacar-beloauto" />,
      );

      const section = container.querySelector('section#lead-form') as HTMLElement;
      expect(section.style.backgroundColor).toBe('var(--ba-background)');
    });
  });

  describe('variant', () => {
    it('centered variant (default) wraps content in max-w-7xl mx-auto stage', () => {
      const { container } = render(<LeadFormModule data={makeData()} slug="lavacar-beloauto" />);

      const stage = container.querySelector('section#lead-form > div');
      expect(stage?.className).toContain('max-w-7xl');
      expect(stage?.className).toContain('mx-auto');
    });

    it('left-aligned variant renders a two-column grid when a background image is present', () => {
      const { container } = render(
        <LeadFormModule
          data={makeData({
            variant: 'left-aligned',
            backgroundImageUrl: 'https://storage.example.com/lead-form.jpg',
          })}
          slug="lavacar-beloauto"
        />,
      );

      const grid = container.querySelector('section#lead-form .grid');
      expect(grid?.className).toContain('sm:grid-cols-2');
    });

    it('left-aligned variant renders a single column when no background image is present', () => {
      const { container } = render(
        <LeadFormModule data={makeData({ variant: 'left-aligned' })} slug="lavacar-beloauto" />,
      );

      const grid = container.querySelector('section#lead-form .grid');
      expect(grid?.className).not.toContain('sm:grid-cols-2');
      expect(container.querySelector('img')).not.toBeInTheDocument();
    });

    it.each([
      ['left', 'left center'],
      ['center', 'center center'],
      ['right', 'right center'],
    ] as const)(
      'centered variant applies objectPosition %s as "%s"',
      (backgroundImagePosition, expected) => {
        const { container } = render(
          <LeadFormModule
            data={makeData({
              backgroundImageUrl: 'https://storage.example.com/lead-form.jpg',
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
        <LeadFormModule
          data={makeData({ backgroundImageUrl: 'https://storage.example.com/lead-form.jpg' })}
          slug="lavacar-beloauto"
        />,
      );

      expect(container.querySelector('img')?.style.objectPosition).toBe('center center');
    });
  });

  it('has no axe violations', async () => {
    const { container } = render(<LeadFormModule data={makeData()} slug="lavacar-beloauto" />);

    expect(await axe(container)).toHaveNoViolations();
  });
});
