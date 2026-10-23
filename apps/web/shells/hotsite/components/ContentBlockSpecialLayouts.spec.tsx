// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { KickerCallout, TrustGridTiles } from './ContentBlockSpecialLayouts';

describe('ContentBlockSpecialLayouts', () => {
  it('numbers tinted trust tiles and preserves their descriptions', () => {
    render(
      <TrustGridTiles
        copy={<h2>Trust</h2>}
        items={[{ label: 'Care', description: 'Every visit' }, { label: 'Skill' }]}
      />,
    );
    expect(screen.getByTestId('trust-grid-tiles').querySelectorAll('li')).toHaveLength(2);
    expect(screen.getByText('01')).toBeInTheDocument();
    expect(screen.getByText('Every visit')).toBeInTheDocument();
  });

  it('places the first technical fact before the copy', () => {
    const { container } = render(
      <KickerCallout fact={{ value: '01', label: 'Protection' }} copy={<h2>Heading</h2>} />,
    );
    expect(container.querySelector('strong')).toHaveTextContent('01');
    expect(container.querySelector('strong')).toAppearBefore(screen.getByRole('heading'));
  });
});
