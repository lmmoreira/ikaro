// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SectionCard } from './section-card';

describe('SectionCard', () => {
  it('renders the title and children', () => {
    render(
      <SectionCard title="Cores">
        <p>Campo de cor</p>
      </SectionCard>,
    );

    expect(screen.getByText('Cores')).toBeInTheDocument();
    expect(screen.getByText('Campo de cor')).toBeInTheDocument();
  });

  it('uses the larger heading by default and the plain-card heading when compact', () => {
    const { rerender } = render(
      <SectionCard title="Cores">
        <p>Campo</p>
      </SectionCard>,
    );
    expect(screen.getByRole('heading', { name: 'Cores' })).toHaveClass('text-base', 'font-bold');

    rerender(
      <SectionCard title="Cores" size="compact">
        <p>Campo</p>
      </SectionCard>,
    );
    expect(screen.getByRole('heading', { name: 'Cores' })).toHaveClass('text-sm', 'font-semibold');
    expect(screen.getByRole('heading', { name: 'Cores' })).not.toHaveClass('font-bold');
  });
});
