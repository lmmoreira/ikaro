// @vitest-environment jsdom
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from '@/axe-helper';
import { SectionLabel } from './section-label';

describe('SectionLabel', () => {
  it('renders a paragraph with the canonical eyebrow look by default', () => {
    render(<SectionLabel>Customer</SectionLabel>);

    const label = screen.getByText('Customer');
    expect(label.tagName).toBe('P');
    expect(label).toHaveClass(
      'text-xs',
      'font-bold',
      'uppercase',
      'tracking-[0.07em]',
      'text-gray-400',
    );
  });

  it.each([
    ['p', 'P'],
    ['h2', 'H2'],
    ['h3', 'H3'],
    ['span', 'SPAN'],
    ['legend', 'LEGEND'],
    ['div', 'DIV'],
  ] as const)('renders the %s element chosen through `as`', (as, tagName) => {
    // A legend is only valid inside a fieldset, so every element renders inside one here.
    render(
      <fieldset>
        <SectionLabel as={as}>Customer</SectionLabel>
      </fieldset>,
    );

    expect(screen.getByText('Customer').tagName).toBe(tagName);
  });

  it('renders a dt inside a definition list', () => {
    render(
      <dl>
        <SectionLabel as="dt">Customer</SectionLabel>
        <dd>Ana</dd>
      </dl>,
    );

    expect(screen.getByText('Customer').tagName).toBe('DT');
  });

  it('applies the info tone in place of the default colour', () => {
    render(<SectionLabel tone="info">Customer</SectionLabel>);

    const label = screen.getByText('Customer');
    expect(label).toHaveClass('text-blue-700', 'uppercase', 'tracking-[0.07em]');
    expect(label).not.toHaveClass('text-gray-400');
  });

  it('merges a custom className and lets it override the tone colour', () => {
    render(
      <SectionLabel className="mb-2 text-red-700" data-testid="label">
        Customer
      </SectionLabel>,
    );

    const label = screen.getByTestId('label');
    expect(label).toHaveClass('mb-2', 'text-red-700', 'font-bold');
    expect(label).not.toHaveClass('text-gray-400');
  });

  it('forwards a ref to the rendered element', () => {
    const ref = createRef<HTMLElement>();
    render(<SectionLabel ref={ref}>Customer</SectionLabel>);

    expect(ref.current).toBeInstanceOf(HTMLParagraphElement);
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <section>
        <SectionLabel as="h2">Customer</SectionLabel>
        <p>Ana</p>
      </section>,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
