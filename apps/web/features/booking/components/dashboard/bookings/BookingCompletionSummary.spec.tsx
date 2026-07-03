// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { BookingCompletionSummary } from './BookingCompletionSummary';

describe('BookingCompletionSummary', () => {
  it('renders quoted vs charged totals and the per-line breakdown', () => {
    renderWithIntl(
      <BookingCompletionSummary
        quotedTotal={100}
        chargedTotal={100}
        lines={[
          { lineId: 'l-1', serviceName: 'Lavagem Simples', quotedPrice: 60, chargedPrice: 60 },
          { lineId: 'l-2', serviceName: 'Cera', quotedPrice: 40, chargedPrice: 40 },
        ]}
        discount={null}
        pointsEarned={8}
      />,
    );

    expect(screen.getByText('Total cotado: R$ 100,00')).toBeInTheDocument();
    expect(screen.getByText('Total cobrado: R$ 100,00')).toBeInTheDocument();
    expect(screen.getByText('Lavagem Simples')).toBeInTheDocument();
    expect(screen.getByText('Cera')).toBeInTheDocument();
    expect(screen.getByText('+8 pts ganhos por este serviço')).toBeInTheDocument();
    expect(screen.getByTestId('complete-email-summary')).toBeInTheDocument();
    expect(screen.queryByTestId('complete-loyalty-discount-applied')).not.toBeInTheDocument();
  });

  it('shows the discount row only when a discount is applied', () => {
    renderWithIntl(
      <BookingCompletionSummary
        quotedTotal={100}
        chargedTotal={76}
        lines={[
          { lineId: 'l-1', serviceName: 'Lavagem Completa', quotedPrice: 100, chargedPrice: 100 },
        ]}
        discount={{ pointsUsed: 240, amount: 24 }}
        pointsEarned={8}
      />,
    );

    expect(screen.getByTestId('complete-loyalty-discount-applied')).toHaveTextContent(
      'Desconto fidelidade: -R$ 24,00',
    );
  });

  it('hides the points-earned line for guest bookings (pointsEarned null)', () => {
    renderWithIntl(
      <BookingCompletionSummary
        quotedTotal={100}
        chargedTotal={100}
        lines={[]}
        discount={null}
        pointsEarned={null}
      />,
    );

    expect(screen.queryByText(/pts ganhos/)).not.toBeInTheDocument();
  });
});
