// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { HotsiteModulePresentation } from '@ikaro/types';
import { axe } from '@/axe-helper';
import type { SectionTokens } from '@/features/platform/hotsite/apply-branding';
import { HotsiteSectionShell } from './HotsiteSectionShell';

const TOKENS: SectionTokens = {
  '--ba-section-bg': '#112233',
  '--ba-section-text': '#FFFFFF',
  '--ba-section-card-bg': '#223344',
  '--ba-section-divider': '#334455',
};

function renderShell(
  props: Partial<React.ComponentProps<typeof HotsiteSectionShell>> = {},
): HTMLElement {
  const { container } = render(
    <HotsiteSectionShell id="x" flow {...props}>
      <p>content</p>
    </HotsiteSectionShell>,
  );
  return container.querySelector('section') as HTMLElement;
}

describe('HotsiteSectionShell', () => {
  describe('without presentation (today’s output)', () => {
    it('renders the module’s own background, colour and padding and the standard container', () => {
      const section = renderShell({
        legacyBackground: 'var(--ba-secondary)',
        legacyColor: 'var(--ba-text)',
        legacyPadding: 'var(--ba-section-py) 1.5rem',
      });

      expect(section.style.backgroundColor).toBe('var(--ba-secondary)');
      expect(section.style.color).toBe('var(--ba-text)');
      expect(section.style.padding).toBe('var(--ba-section-py) 1.5rem');
      expect(section.firstElementChild).toHaveClass('mx-auto', 'max-w-7xl');
      expect(screen.queryByTestId('section-overlay')).not.toBeInTheDocument();
    });

    it('does not wrap a non-flow section’s children', () => {
      const section = renderShell({ flow: false });

      expect(section.firstElementChild?.tagName).toBe('P');
    });

    it('adds no scrim over the module’s own photo (existing photo sections are unchanged)', () => {
      renderShell({ ownBackground: <div data-testid="own-photo" /> });

      expect(screen.queryByTestId('section-overlay')).not.toBeInTheDocument();
    });
  });

  describe('surface', () => {
    const presentation: HotsiteModulePresentation = { surface: 'primary' };

    it('beats the module’s own background and exposes the scoped section tokens', () => {
      const section = renderShell({
        legacyBackground: 'var(--ba-secondary)',
        legacyColor: 'var(--ba-text)',
        presentation,
        sectionTokens: TOKENS,
      });

      expect(section.style.backgroundColor).toBe('var(--ba-section-bg)');
      expect(section.style.color).toBe('var(--ba-section-text)');
      expect(section.style.getPropertyValue('--ba-section-bg')).toBe('#112233');
      expect(section.style.getPropertyValue('--ba-section-card-bg')).toBe('#223344');
    });

    it('keeps the module’s own colours when a surface is set but no tokens were derived', () => {
      const section = renderShell({
        legacyBackground: 'var(--ba-secondary)',
        presentation,
      });

      expect(section.style.backgroundColor).toBe('var(--ba-secondary)');
    });
  });

  describe('contentWidth, minHeight and padding each change the output', () => {
    it.each([
      ['narrow', 'max-w-3xl'],
      ['wide', 'max-w-[90rem]'],
      ['full', 'max-w-none'],
    ] as const)('contentWidth %s bounds the container with %s', (contentWidth, expected) => {
      const section = renderShell({ presentation: { contentWidth } });

      expect(section.firstElementChild).toHaveClass(expected);
      expect(section.firstElementChild).not.toHaveClass('max-w-7xl');
    });

    it('applies a minimum height and centres the content in a flow section', () => {
      const section = renderShell({ presentation: { minHeight: 'lg' } });

      expect(section.style.minHeight).toBe('44rem');
      expect(section).toHaveClass('flex', 'flex-col', 'justify-center');
    });

    it('does not add centring to a section that lays out its own stage', () => {
      const section = renderShell({ presentation: { minHeight: 'lg' }, selfLayout: true });

      expect(section).not.toHaveClass('justify-center');
    });

    it('overrides only the vertical padding', () => {
      const section = renderShell({
        legacyPadding: 'var(--ba-section-py) 1.5rem',
        presentation: { padding: 'none' },
      });

      expect(section.style.paddingBlock).toBe('0px');
      // The horizontal gutter stays in the shorthand; only the block axis is overridden after it.
      const style = section.getAttribute('style') ?? '';
      expect(style).toContain('padding: var(--ba-section-py) 1.5rem');
      expect(style.indexOf('padding-block')).toBeGreaterThan(style.indexOf('padding:'));
    });
  });

  describe('background image and overlay', () => {
    const background = { imageUrl: 'https://cdn.example.com/bg.png', position: 'left' } as const;

    it('draws presentation.background behind the content and gives it the minimum scrim', () => {
      const section = renderShell({ presentation: { background } });

      expect(section.querySelector('img')).toHaveAttribute(
        'src',
        expect.stringContaining('bg.png'),
      );
      expect(section).toHaveClass('relative');
      expect(screen.getByTestId('section-overlay').style.background).toContain('rgba(0, 0, 0');
    });

    it('still gives a photo with overlay none the minimum scrim', () => {
      renderShell({ presentation: { background, overlay: { type: 'none' } } });

      expect(screen.getByTestId('section-overlay')).toBeInTheDocument();
    });

    it('gives the module’s own photo the minimum scrim once the module opts into presentation', () => {
      renderShell({ presentation: {}, ownBackground: <div data-testid="own-photo" /> });

      expect(screen.getByTestId('section-overlay')).toBeInTheDocument();
    });

    it('uses an explicit overlay as written', () => {
      renderShell({
        presentation: { overlay: { type: 'solid', color: '#FF0000', opacity: 0.4 } },
      });

      expect(screen.getByTestId('section-overlay').style.background).toBe('rgba(255, 0, 0, 0.4)');
    });

    it('renders the overlay as a separate non-interactive layer above the photo and below the content', () => {
      const section = renderShell({ presentation: { background } });
      const overlay = screen.getByTestId('section-overlay');

      expect(overlay).toHaveClass('pointer-events-none', 'absolute', 'inset-0');
      expect(overlay).toHaveAttribute('aria-hidden', 'true');
      const children = Array.from(section.children);
      expect(children.indexOf(overlay)).toBeLessThan(children.length - 1);
      expect(children.at(-1)).toHaveClass('relative', 'z-10');
    });

    it('renders no image for a null presentation background path', () => {
      const section = renderShell({ presentation: { background: { imageUrl: null } } });

      expect(section.querySelector('img')).toBeNull();
    });
  });

  it('has no accessibility violations with a surface, photo and overlay', async () => {
    const { container } = render(
      <HotsiteSectionShell
        id="x"
        flow
        presentation={{
          surface: 'primary',
          background: { imageUrl: 'https://cdn.example.com/bg.png' },
          overlay: { type: 'solid', color: '#000000', opacity: 0.3 },
        }}
        sectionTokens={TOKENS}
      >
        <h2>Title</h2>
      </HotsiteSectionShell>,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
