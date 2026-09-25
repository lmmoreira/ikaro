// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BookingResourceSummaryLine } from './BookingResourceSummaryLine';

describe('BookingResourceSummaryLine', () => {
  it('renders nothing when resourceNames is empty', () => {
    const { container } = render(<BookingResourceSummaryLine resourceNames={[]} compact={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows just the name, no +N, for exactly one matched resource', () => {
    render(<BookingResourceSummaryLine resourceNames={['Camila Duarte']} compact={false} />);
    const line = screen.getByTestId('timeline-block-resource-summary');
    expect(line).toHaveTextContent('Camila Duarte');
    expect(line).not.toHaveTextContent('+');
  });

  it('shows the primary name + "+N" for 2+ matched resources, N = remaining count', () => {
    render(
      <BookingResourceSummaryLine
        resourceNames={['Camila Duarte', 'Sala 2', 'Secador']}
        compact={false}
      />,
    );
    const line = screen.getByTestId('timeline-block-resource-summary');
    expect(line).toHaveTextContent('Camila Duarte +2');
  });

  it('sets an aria-label listing every matched resource name, not just the visible one', () => {
    render(
      <BookingResourceSummaryLine
        resourceNames={['Camila Duarte', 'Sala 2', 'Secador']}
        compact={false}
      />,
    );
    const line = screen.getByTestId('timeline-block-resource-summary');
    expect(line).toHaveAttribute('aria-label', 'Camila Duarte, Sala 2, Secador');
  });
});
