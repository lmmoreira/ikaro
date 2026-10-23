// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RestrictedMarkdown } from './RestrictedMarkdown';

describe('RestrictedMarkdown', () => {
  it('renders paragraphs, emphasis and lists', () => {
    const { container } = render(
      <RestrictedMarkdown>{'Primeiro **forte**\n\n- um\n- dois\n\n1. a\n2. b'}</RestrictedMarkdown>,
    );

    expect(screen.getByText('forte').tagName).toBe('STRONG');
    expect(container.querySelectorAll('ul > li')).toHaveLength(2);
    expect(container.querySelectorAll('ol > li')).toHaveLength(2);
  });

  it('renders links opening in a new tab with rel noopener noreferrer nofollow', () => {
    render(<RestrictedMarkdown>{'[site](https://example.com)'}</RestrictedMarkdown>);

    const link = screen.getByRole('link', { name: 'site' });
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow');
  });

  // Negative guarantees: an image only ever comes from a validated image slot, and raw HTML is
  // never parsed into the page.
  it('renders no image', () => {
    const { container } = render(
      <RestrictedMarkdown>{'![alt](https://example.com/a.png)'}</RestrictedMarkdown>,
    );

    expect(container.querySelector('img')).toBeNull();
  });

  it('does not turn raw HTML into elements', () => {
    const { container } = render(
      <RestrictedMarkdown>{'<script>alert(1)</script><b>x</b>'}</RestrictedMarkdown>,
    );

    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
  });

  it('demotes headings so the section title stays the only h2', () => {
    const { container } = render(<RestrictedMarkdown>{'# Um\n\n## Dois'}</RestrictedMarkdown>);

    expect(container.querySelector('h1, h2')).toBeNull();
    expect(container.querySelectorAll('h3')).toHaveLength(2);
  });

  it('has a more generous comfortable density than the compact default', () => {
    const { container: compact } = render(<RestrictedMarkdown>{'texto'}</RestrictedMarkdown>);
    const { container: comfortable } = render(
      <RestrictedMarkdown density="comfortable">{'texto'}</RestrictedMarkdown>,
    );

    expect(compact.querySelector('p')).toHaveClass('text-sm');
    expect(comfortable.querySelector('p')).toHaveClass('text-base');
  });
});
