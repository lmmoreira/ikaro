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
        onOpenNoShow={vi.fn()}
        noShowAvailableAt={null}
      />,
    );

    expect(screen.getByRole('button', { name: 'Marcar concluído' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Marcar não compareceu' })).toBeInTheDocument();
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

  describe('no-show action on an approved booking (UC-074)', () => {
    function renderApproved(noShowAvailableAt: string | null, isSubmitting = false) {
      const onOpenNoShow = vi.fn();
      renderWithIntl(
        <BookingActionPanel
          bookingStatus={BOOKING_STATUS.APPROVED}
          isSubmitting={isSubmitting}
          onOpenComplete={vi.fn()}
          onOpenReschedule={vi.fn()}
          onOpenCancel={vi.fn()}
          onOpenNoShow={onOpenNoShow}
          noShowAvailableAt={noShowAvailableAt}
        />,
      );
      return onOpenNoShow;
    }

    it('is enabled after the end time and opens the sheet', async () => {
      const onOpenNoShow = renderApproved(null);

      await userEvent.click(screen.getByRole('button', { name: 'Marcar não compareceu' }));

      expect(onOpenNoShow).toHaveBeenCalledOnce();
      expect(screen.queryByText(/Disponível após o término/)).not.toBeInTheDocument();
    });

    it('is disabled before the end time and says when it becomes available', async () => {
      const onOpenNoShow = renderApproved('17:30');
      const button = screen.getByRole('button', { name: 'Marcar não compareceu' });

      expect(button).toBeDisabled();
      expect(button).toHaveAccessibleDescription(
        'Disponível após o término do atendimento (17:30).',
      );
      await userEvent.click(button);
      expect(onOpenNoShow).not.toHaveBeenCalled();
    });

    it('is disabled while another action is submitting', () => {
      renderApproved(null, true);

      expect(screen.getByRole('button', { name: 'Marcar não compareceu' })).toBeDisabled();
    });
  });

  describe('NO_SHOW booking', () => {
    it('offers the correction to a manager', async () => {
      const onOpenCorrect = vi.fn();
      renderWithIntl(
        <BookingActionPanel
          bookingStatus={BOOKING_STATUS.NO_SHOW}
          isSubmitting={false}
          canCorrect
          onOpenCorrect={onOpenCorrect}
        />,
      );

      await userEvent.click(screen.getByRole('button', { name: 'Corrigir para concluído' }));

      expect(onOpenCorrect).toHaveBeenCalledOnce();
      expect(screen.queryByTestId('no-show-read-only-note')).not.toBeInTheDocument();
    });

    it('hides the correction from staff and says only a manager can correct', () => {
      renderWithIntl(
        <BookingActionPanel
          bookingStatus={BOOKING_STATUS.NO_SHOW}
          isSubmitting={false}
          canCorrect={false}
          onOpenCorrect={vi.fn()}
        />,
      );

      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      expect(screen.getByTestId('no-show-read-only-note')).toHaveTextContent(
        'Nenhuma ação disponível. Somente um gerente pode corrigir este registro.',
      );
    });
  });
});
