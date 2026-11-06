// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, expect, it } from 'vitest';
import { LabeledSection } from './labeled-section';

describe('LabeledSection', () => {
  it('renders a section with the label first and the children after it', () => {
    render(
      <LabeledSection title="Customer" testId="customer-section">
        <p>Ana</p>
      </LabeledSection>,
    );

    const section = screen.getByTestId('customer-section');
    expect(section.tagName).toBe('SECTION');
    expect(section.children).toHaveLength(2);
    expect(section.children[0]).toHaveTextContent('Customer');
    expect(section.children[1]).toHaveTextContent('Ana');
  });

  it('gives the label the section eyebrow look and the gap to the content', () => {
    render(
      <LabeledSection title="Customer">
        <p>Ana</p>
      </LabeledSection>,
    );

    expect(screen.getByText('Customer')).toHaveClass('mb-2', 'uppercase', 'font-bold');
  });

  it('puts labelTestId on the label and testId on the section, not the other way round', () => {
    render(
      <LabeledSection title="Customer" testId="the-section" labelTestId="the-label">
        <p>Ana</p>
      </LabeledSection>,
    );

    expect(screen.getByTestId('the-label')).toHaveTextContent('Customer');
    expect(screen.getByTestId('the-label').tagName).toBe('P');
    expect(screen.getByTestId('the-section').tagName).toBe('SECTION');
  });

  it('merges className onto the section', () => {
    render(
      <LabeledSection title="Customer" testId="the-section" className="mt-4">
        <p>Ana</p>
      </LabeledSection>,
    );

    expect(screen.getByTestId('the-section')).toHaveClass('mt-4');
  });

  it('renders no test id attributes when none is given', () => {
    const { container } = render(
      <LabeledSection title="Customer">
        <p>Ana</p>
      </LabeledSection>,
    );

    expect(container.querySelector('[data-testid]')).toBeNull();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <LabeledSection title="Customer">
        <p>Ana</p>
      </LabeledSection>,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
