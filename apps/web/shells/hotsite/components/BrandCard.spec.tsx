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
