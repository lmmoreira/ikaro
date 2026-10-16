// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { BookingOriginCard } from './BookingOriginCard';

describe('BookingOriginCard', () => {
  it('renders nothing when there is no origin information', () => {
    renderWithIntl(<BookingOriginCard />);

    expect(screen.queryByTestId('booking-origin-card')).not.toBeInTheDocument();
  });

  it('shows when the booking was requested', () => {
    renderWithIntl(<BookingOriginCard requestedAt="2026-06-14T12:12:00.000Z" />);

    expect(screen.getByText('Solicitado em')).toBeInTheDocument();
    expect(screen.getByText(/às \d{2}:\d{2}/)).toBeInTheDocument();
  });

  it('links to the recurrence an occurrence belongs to', () => {
    renderWithIntl(<BookingOriginCard recurrenceHref="/dashboard/bookings/recurring/s-1" />);

    expect(screen.getByRole('link', { name: 'Ver recorrência' })).toHaveAttribute(
      'href',
      '/dashboard/bookings/recurring/s-1',
    );
  });

  it('names the staff member who created the booking, with a role fallback', () => {
    const { rerender } = renderWithIntl(<BookingOriginCard createdBy={{ name: 'Ana Pereira' }} />);
    expect(screen.getByText('Ana Pereira')).toBeInTheDocument();
    expect(screen.getByText('Reserva feita pela equipe em nome do cliente')).toBeInTheDocument();

    rerender(<BookingOriginCard createdBy={{ name: null }} />);
    expect(screen.getByText('Equipe')).toBeInTheDocument();
  });

  it('shows no "Criado por" row for a booking the customer made', () => {
    renderWithIntl(<BookingOriginCard requestedAt="2026-06-14T12:12:00.000Z" />);

    expect(screen.queryByText('Criado por')).not.toBeInTheDocument();
  });
});
