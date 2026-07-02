// @vitest-environment jsdom
import { BOOKING_STATUS } from '@ikaro/types';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { BookingActionPanel } from './BookingActionPanel';

describe('BookingActionPanel', () => {
  it('renders the three triage actions for pending bookings', () => {
    renderWithIntl(
      <BookingActionPanel
        bookingStatus={BOOKING_STATUS.PENDING}
        isSubmitting={false}
        onApprove={vi.fn()}
        onOpenReject={vi.fn()}
        onOpenRequestInfo={vi.fn()}
      />,
    );

    expect(screen.getByText('Ações')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aprovar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rejeitar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pedir info' })).toBeInTheDocument();
  });

  it('hides request info once the booking is already awaiting info', () => {
    renderWithIntl(
      <BookingActionPanel
        bookingStatus={BOOKING_STATUS.INFO_REQUESTED}
        isSubmitting={false}
        onApprove={vi.fn()}
        onOpenReject={vi.fn()}
        onOpenRequestInfo={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Aprovar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rejeitar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pedir info' })).not.toBeInTheDocument();
  });

  it('renders lifecycle actions for approved bookings', () => {
    renderWithIntl(
      <BookingActionPanel
        bookingStatus={BOOKING_STATUS.APPROVED}
        isSubmitting={false}
        onOpenComplete={vi.fn()}
        onOpenReschedule={vi.fn()}
        onOpenCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Marcar concluído' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reagendar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar agendamento' })).toBeInTheDocument();
  });

  it('disables the actions while submitting', () => {
    renderWithIntl(
      <BookingActionPanel
        bookingStatus={BOOKING_STATUS.PENDING}
        isSubmitting={true}
        onApprove={vi.fn()}
        onOpenReject={vi.fn()}
        onOpenRequestInfo={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Aprovar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Rejeitar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Pedir info' })).toBeDisabled();
  });

  it('calls the approve callback when clicked', async () => {
    const onApprove = vi.fn();
    renderWithIntl(
      <BookingActionPanel
        bookingStatus={BOOKING_STATUS.PENDING}
        isSubmitting={false}
        onApprove={onApprove}
        onOpenReject={vi.fn()}
        onOpenRequestInfo={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Aprovar' }));
    expect(onApprove).toHaveBeenCalledOnce();
  });
});
