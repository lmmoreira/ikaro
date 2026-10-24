// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { axe } from '@/axe-helper';
import { describe, expect, it } from 'vitest';
import type { AboutModuleData } from '@ikaro/types';
import { AboutModule } from './AboutModule';

function makeData(overrides?: Partial<AboutModuleData>): AboutModuleData {
  return {
    title: 'Sobre nós',
    body: 'Somos uma empresa **familiar** com 10 anos de experiência.',
    imagePosition: 'right',
    ...overrides,
  };
}

describe('AboutModule', () => {
  it('places a bleed image edge to edge with a mobile aspect ratio', () => {
    const { container } = render(
      <AboutModule
        data={makeData({ variant: 'bleed', imageUrl: 'https://storage.example.com/about.jpg' })}
        slug="tenant"
      />,
    );
    const section = container.querySelector('#about');
    expect(section).toHaveAttribute('data-variant', 'bleed');
    expect(section).toHaveStyle({ padding: '0' });
    expect(section?.querySelector('img')?.parentElement).toHaveClass(
      'aspect-[4/3]',
      'md:min-h-[540px]',
    );
  });
  it('renders the title and markdown body as HTML', () => {
    render(<AboutModule data={makeData()} slug="tenant" />);

    expect(screen.getByRole('heading', { name: 'Sobre nós' })).toBeInTheDocument();
    expect(screen.getByText('familiar').tagName).toBe('STRONG');
  });

  it('renders no <img> when imageUrl is absent', () => {
    const { container } = render(
      <AboutModule data={makeData({ imageUrl: undefined })} slug="tenant" />,
    );

    expect(container.querySelector('img')).not.toBeInTheDocument();
  });

  it('renders the image before the text when imagePosition is left', () => {
    const { container } = render(
      <AboutModule
        data={makeData({
          imagePosition: 'left',
          imageUrl: 'https://storage.example.com/about.jpg',
        })}
        slug="tenant"
      />,
    );

    const html = container.innerHTML;
    expect(html.indexOf('<img')).toBeGreaterThanOrEqual(0);
    expect(html.indexOf('<img')).toBeLessThan(html.indexOf('Sobre n'));
  });

  it('renders the image after the text when imagePosition is right', () => {
    const { container } = render(
      <AboutModule
        data={makeData({
          imagePosition: 'right',
          imageUrl: 'https://storage.example.com/about.jpg',
        })}
        slug="tenant"
      />,
    );

    const html = container.innerHTML;
    expect(html.indexOf('<img')).toBeGreaterThanOrEqual(0);
    expect(html.indexOf('Sobre n')).toBeLessThan(html.indexOf('<img'));
  });

  it('strips raw <script> tags from the markdown body', () => {
    const { container } = render(
      <AboutModule
        data={makeData({ body: 'Texto normal <script>alert("xss")</script> depois.' })}
        slug="tenant"
      />,
    );

    expect(container.querySelector('script')).not.toBeInTheDocument();
  });

  it('renders markdown headings, lists, and links with the custom components', () => {
    const { container } = render(
      <AboutModule
        data={makeData({
          body: `# Um título\n\n## Um subtítulo\n\n### Uma seção\n\n- Item 1\n- Item 2\n\n1. Passo 1\n2. Passo 2\n\n[Site oficial](https://example.com)`,
        })}
        slug="tenant"
      />,
    );

    expect(container.querySelectorAll('h3')).toHaveLength(3);
    expect(container.querySelector('ul')).toBeInTheDocument();
    expect(container.querySelector('ol')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Site oficial' })).toHaveAttribute(
      'href',
      'https://example.com',
    );
  });

  describe('eyebrow', () => {
    it('renders eyebrow when provided', () => {
      render(<AboutModule data={makeData({ eyebrow: 'Nossa história' })} slug="tenant" />);

      expect(screen.getByTestId('section-eyebrow')).toHaveTextContent('Nossa história');
    });

    it('does not render eyebrow when absent', () => {
      const { container } = render(<AboutModule data={makeData()} slug="tenant" />);

      expect(container.querySelector('[data-testid="section-eyebrow"]')).not.toBeInTheDocument();
    });
  });

  it('has no axe violations', async () => {
    const { container } = render(<AboutModule data={makeData()} slug="tenant" />);

    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('AboutModule editorial variant', () => {
  it('renders a single long-form column with the image first and a larger title', () => {
    const { container } = render(
      <AboutModule
        data={makeData({ variant: 'editorial', imageUrl: 'https://storage.example.com/about.jpg' })}
        slug="tenant"
      />,
    );

    const column = container.querySelector('[data-variant="editorial"]') as HTMLElement;
    expect(column.firstElementChild?.querySelector('img')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sobre nós' })).toHaveClass('text-4xl');
    expect(screen.getByText('familiar').tagName).toBe('STRONG');
  });

  it('renders without an image', () => {
    const { container } = render(
      <AboutModule data={makeData({ variant: 'editorial' })} slug="tenant" />,
    );

    expect(container.querySelector('img')).toBeNull();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <AboutModule
        data={makeData({ variant: 'editorial', imageUrl: 'https://storage.example.com/about.jpg' })}
        slug="tenant"
      />,
    );

    expect(await axe(container)).toHaveNoViolations();
  });

  // Negative guarantee: an omitted variant is today's split layout, with imagePosition still working.
  it('an omitted variant keeps the split two-column layout', () => {
    const { container } = render(<AboutModule data={makeData()} slug="tenant" />);

    expect(container.querySelector('[data-variant="editorial"]')).toBeNull();
    expect(container.querySelector('section > div')).toHaveClass('md:grid-cols-2');
  });

  it('renders Markdown links with the shared restricted rel', () => {
    render(<AboutModule data={makeData({ body: '[x](https://example.com)' })} slug="tenant" />);

    expect(screen.getByRole('link', { name: 'x' })).toHaveAttribute(
      'rel',
      'noopener noreferrer nofollow',
    );
  });

  it('keeps the split layout unchanged when no variant is set', () => {
    const data = makeData({ imageUrl: 'https://storage.example.com/about.jpg' });
    const omitted = render(<AboutModule data={data} slug="t" />);
    const html = omitted.container.innerHTML;
    omitted.unmount();
    const explicit = render(<AboutModule data={{ ...data, variant: 'split' }} slug="t" />);
    expect(explicit.container.innerHTML).toBe(html);
  });
});
