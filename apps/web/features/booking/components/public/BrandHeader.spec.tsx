// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BrandHeader } from './BrandHeader';

describe('BrandHeader', () => {
  it('renders the brand name and its first letter as the avatar initial', () => {
    render(<BrandHeader brandName="BeloAuto" />);

    expect(screen.getByTestId('brand-name')).toHaveTextContent('BeloAuto');
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('falls back to a "?" avatar and omits the name span when brandName is absent', () => {
    render(<BrandHeader />);

    expect(screen.queryByTestId('brand-name')).not.toBeInTheDocument();
    expect(screen.getByText('?')).toBeInTheDocument();
  });
});
