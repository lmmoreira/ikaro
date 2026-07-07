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
});
