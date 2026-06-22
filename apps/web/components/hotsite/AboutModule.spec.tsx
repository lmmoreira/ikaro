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
