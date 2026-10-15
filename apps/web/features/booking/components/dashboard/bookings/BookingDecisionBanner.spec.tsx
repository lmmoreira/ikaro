// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { BookingDecisionBanner } from './BookingDecisionBanner';

describe('BookingDecisionBanner', () => {
  it('renders nothing when the booking does not need a decision', () => {
    const { container } = renderWithIntl(<BookingDecisionBanner needsDecision={false} canDecide />);

    expect(container).toBeEmptyDOMElement();
  });

  it('tells a manager how to resolve it, with no link (the actions are in the decision panel)', () => {
    renderWithIntl(<BookingDecisionBanner needsDecision canDecide />);

    expect(screen.getByText('Esta reserva precisa de uma decisão')).toBeInTheDocument();
    expect(screen.getByText(/Escolha como resolver/)).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  // Negative guarantee: STAFF cannot open the manager-only worklist, so it gets a hint, never a link.
  it('tells STAFF to ask a manager and offers no link', () => {
    renderWithIntl(<BookingDecisionBanner needsDecision canDecide={false} />);

    expect(screen.getByText(/Peça a um gerente para resolver/)).toBeInTheDocument();
    expect(screen.queryByText(/Escolha como resolver/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
