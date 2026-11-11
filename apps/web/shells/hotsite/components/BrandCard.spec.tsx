// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from '@/axe-helper';
import { BrandCard } from './BrandCard';

describe('BrandCard', () => {
  it('renders the name on a branded card with the caller’s test id', () => {
    render(<BrandCard name="BELOAUTO" testId="brand-card" />);

    const card = screen.getByTestId('brand-card');
    expect(card).toHaveTextContent('BELOAUTO');
    expect(card).toHaveStyle({ backgroundColor: 'var(--ba-secondary)' });
  });

  it('renders the tagline, with its own test id, only when there is one', () => {
    const { rerender } = render(
      <BrandCard name="BELOAUTO" tagline="Estética Automotiva" testId="c" taglineTestId="t" />,
    );
    expect(screen.getByTestId('t')).toHaveTextContent('Estética Automotiva');

    rerender(<BrandCard name="BELOAUTO" testId="c" taglineTestId="t" />);
    expect(screen.queryByTestId('t')).not.toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <BrandCard name="BELOAUTO" tagline="Estética Automotiva" testId="brand-card" />,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('BrandCard readable colours (TD51-S05)', () => {
  it('draws the name in the derived accent and the card text in the derived secondary text', () => {
    render(<BrandCard name="BELOAUTO" tagline="Estética" testId="brand-card" taglineTestId="t" />);

    expect(screen.getByTestId('brand-card').style.color).toBe('var(--ba-secondary-text)');
    expect(screen.getByText('BELOAUTO').style.color).toBe(
      'var(--ba-secondary-accent, var(--ba-secondary-text))',
    );
  });

  it('never paints --ba-text or --ba-primary as a text colour on the secondary surface', () => {
    const { container } = render(
      <BrandCard name="BELOAUTO" tagline="Estética" testId="brand-card" taglineTestId="t" />,
    );

    expect(container.innerHTML).not.toMatch(/color: var\(--ba-(text|primary)\)/);
    // The tagline uses the derived muted colour, never an opacity on the text colour, which would
    // push a colour derived to 4.5:1 below it.
    expect(screen.getByTestId('t').style.color).toBe(
      'var(--ba-secondary-muted, var(--ba-secondary-text))',
    );
    expect(screen.getByTestId('t').style.opacity).toBe('');
  });
});
