// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { ApiError, ForbiddenError } from '@/shared/lib/api/errors';
import { BookingDetailSheets } from './BookingDetailSheets';

const rejectBookingMutateAsync = vi.hoisted(() => vi.fn());
const requestMoreInfoMutateAsync = vi.hoisted(() => vi.fn());
const cancelBookingMutateAsync = vi.hoisted(() => vi.fn());
const markNoShowMutateAsync = vi.hoisted(() => vi.fn());
const correctNoShowMutateAsync = vi.hoisted(() => vi.fn());

vi.mock('@/features/booking/hooks/useBookingMutations', () => ({
  useRejectBooking: () => ({ mutateAsync: rejectBookingMutateAsync }),
  useRequestMoreInfo: () => ({ mutateAsync: requestMoreInfoMutateAsync }),
  useCancelBooking: () => ({ mutateAsync: cancelBookingMutateAsync }),
  useMarkNoShow: () => ({ mutateAsync: markNoShowMutateAsync }),
  useCorrectNoShow: () => ({ mutateAsync: correctNoShowMutateAsync }),
}));

function baseProps(overrides: Partial<Parameters<typeof BookingDetailSheets>[0]> = {}) {
  return {
    bookingId: 'b-1',
    contactName: 'João Silva',
    correctionPoints: 12,
    correctionServices: 'Lavagem Simples',
    sheetState: null,
    isSubmitting: false,
    locale: 'pt-BR' as const,
    onClose: vi.fn(),
    onSubmittingStart: vi.fn(),
    onRejected: vi.fn(),
    onInfoRequested: vi.fn(),
    onCancelled: vi.fn(),
    onSettleError: vi.fn(),
    onNoShowMarked: vi.fn(),
    onNoShowFailed: vi.fn(),
    onNoShowCorrected: vi.fn(),
    onCorrectFailed: vi.fn(),
    ...overrides,
  };
}

describe('BookingDetailSheets', () => {
  afterEach(() => {
    rejectBookingMutateAsync.mockReset();
    requestMoreInfoMutateAsync.mockReset();
    cancelBookingMutateAsync.mockReset();
    markNoShowMutateAsync.mockReset();
    correctNoShowMutateAsync.mockReset();
  });

  it('renders nothing when sheetState is null', () => {
    const { container } = renderWithIntl(<BookingDetailSheets {...baseProps()} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('submits a rejection and calls onRejected on success', async () => {
    const user = userEvent.setup();
    rejectBookingMutateAsync.mockResolvedValue(undefined);
    const onRejected = vi.fn();
    const onSubmittingStart = vi.fn();
    renderWithIntl(
      <BookingDetailSheets
        {...baseProps({ sheetState: 'reject', onRejected, onSubmittingStart })}
      />,
    );

    await user.type(screen.getByRole('textbox'), 'Sem disponibilidade');
    await user.click(screen.getByRole('button', { name: 'Rejeitar' }));

    expect(onSubmittingStart).toHaveBeenCalled();
    expect(rejectBookingMutateAsync).toHaveBeenCalledWith({
      id: 'b-1',
      body: { reason: 'Sem disponibilidade' },
    });
    expect(onRejected).toHaveBeenCalledWith('Sem disponibilidade');
  });

  it('calls onSettleError with the generic message when reject fails without a validation detail', async () => {
    const user = userEvent.setup();
    rejectBookingMutateAsync.mockRejectedValue(new Error('network error'));
    const onSettleError = vi.fn();
    renderWithIntl(<BookingDetailSheets {...baseProps({ sheetState: 'reject', onSettleError })} />);

    await user.type(screen.getByRole('textbox'), 'Sem disponibilidade');
    await user.click(screen.getByRole('button', { name: 'Rejeitar' }));

    expect(onSettleError).toHaveBeenCalledWith(expect.any(String), false);
  });

  it('calls onSettleError with isValidationError=true when the backend returns a field violation', async () => {
    const user = userEvent.setup();
    rejectBookingMutateAsync.mockRejectedValue(
      new ApiError(400, 'Bad request', {
        violations: [{ field: 'reason', code: 'STRING_TOO_SHORT' }],
      }),
    );
    const onSettleError = vi.fn();
    renderWithIntl(<BookingDetailSheets {...baseProps({ sheetState: 'reject', onSettleError })} />);

    await user.type(screen.getByRole('textbox'), 'x');
    await user.click(screen.getByRole('button', { name: 'Rejeitar' }));

    expect(onSettleError).toHaveBeenCalledWith(expect.any(String), true);
  });

  it('submits an info request and calls onInfoRequested on success', async () => {
    const user = userEvent.setup();
    requestMoreInfoMutateAsync.mockResolvedValue(undefined);
    const onInfoRequested = vi.fn();
    renderWithIntl(<BookingDetailSheets {...baseProps({ sheetState: 'info', onInfoRequested })} />);

    await user.type(screen.getByRole('textbox'), 'Precisamos do endereço completo');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(requestMoreInfoMutateAsync).toHaveBeenCalledWith({
      id: 'b-1',
      body: { message: 'Precisamos do endereço completo' },
    });
    expect(onInfoRequested).toHaveBeenCalledWith('Precisamos do endereço completo');
  });

  it('submits a cancellation and calls onCancelled on success', async () => {
    const user = userEvent.setup();
    cancelBookingMutateAsync.mockResolvedValue(undefined);
    const onCancelled = vi.fn();
    renderWithIntl(<BookingDetailSheets {...baseProps({ sheetState: 'cancel', onCancelled })} />);

    await user.click(screen.getByRole('button', { name: 'Cancelar agendamento' }));

    expect(cancelBookingMutateAsync).toHaveBeenCalledWith({ id: 'b-1' });
    expect(onCancelled).toHaveBeenCalled();
  });

  it('calls onSettleError with the generic cancel message when cancel fails', async () => {
    const user = userEvent.setup();
    cancelBookingMutateAsync.mockRejectedValue(new Error('network error'));
    const onSettleError = vi.fn();
    renderWithIntl(<BookingDetailSheets {...baseProps({ sheetState: 'cancel', onSettleError })} />);

    await user.click(screen.getByRole('button', { name: 'Cancelar agendamento' }));

    expect(onSettleError).toHaveBeenCalledWith(expect.any(String), false);
  });

  describe('no-show sheet (UC-074)', () => {
    it('posts the no-show without a body when no reason was typed', async () => {
      const user = userEvent.setup();
      markNoShowMutateAsync.mockResolvedValue(undefined);
      const onNoShowMarked = vi.fn();
      const onSubmittingStart = vi.fn();
      renderWithIntl(
        <BookingDetailSheets
          {...baseProps({ sheetState: 'no-show', onNoShowMarked, onSubmittingStart })}
        />,
      );

      await user.click(screen.getByRole('button', { name: 'Confirmar não comparecimento' }));

      expect(onSubmittingStart).toHaveBeenCalled();
      expect(markNoShowMutateAsync).toHaveBeenCalledWith({ id: 'b-1' });
      expect(onNoShowMarked).toHaveBeenCalledTimes(1);
    });

    it('posts the reason when one was typed', async () => {
      const user = userEvent.setup();
      markNoShowMutateAsync.mockResolvedValue(undefined);
      renderWithIntl(<BookingDetailSheets {...baseProps({ sheetState: 'no-show' })} />);

      await user.type(screen.getByRole('textbox'), 'Cliente não atendeu o telefone.');
      await user.click(screen.getByRole('button', { name: 'Confirmar não comparecimento' }));

      expect(markNoShowMutateAsync).toHaveBeenCalledWith({
        id: 'b-1',
        body: { reason: 'Cliente não atendeu o telefone.' },
      });
    });

    it.each([
      [
        'a 409 BOOKING_ALREADY_TERMINAL',
        new ApiError(409, 'closed', { code: 'BOOKING_ALREADY_TERMINAL' }),
        'no-show-terminal',
      ],
      [
        'a 422 BOOKING_NOT_YET_ENDED',
        new ApiError(422, 'early', { code: 'BOOKING_NOT_YET_ENDED' }),
        'no-show-not-ended',
      ],
      ['a network failure', new ApiError(0, 'Network Error'), 'no-show-error'],
      ['a 5xx', new ApiError(500, 'Internal server error'), 'no-show-error'],
    ])('routes %s to its banner without marking the booking', async (_label, error, expected) => {
      const user = userEvent.setup();
      markNoShowMutateAsync.mockRejectedValue(error);
      const onNoShowFailed = vi.fn();
      const onNoShowMarked = vi.fn();
      renderWithIntl(
        <BookingDetailSheets
          {...baseProps({ sheetState: 'no-show', onNoShowFailed, onNoShowMarked })}
        />,
      );

      await user.click(screen.getByRole('button', { name: 'Confirmar não comparecimento' }));

      expect(onNoShowFailed).toHaveBeenCalledWith(expected);
      expect(onNoShowMarked).not.toHaveBeenCalled();
    });
  });

  describe('correct no-show sheet (UC-074 A3)', () => {
    const REASON = 'Cliente chegou atrasado e foi atendido.';

    it('posts the correction to COMPLETED with the trimmed reason', async () => {
      const user = userEvent.setup();
      correctNoShowMutateAsync.mockResolvedValue(undefined);
      const onNoShowCorrected = vi.fn();
      renderWithIntl(
        <BookingDetailSheets
          {...baseProps({ sheetState: 'correct-no-show', onNoShowCorrected })}
        />,
      );

      await user.type(screen.getByRole('textbox'), `  ${REASON}  `);
      await user.click(screen.getByRole('button', { name: 'Confirmar correção' }));

      expect(correctNoShowMutateAsync).toHaveBeenCalledWith({
        id: 'b-1',
        body: { correctedStatus: 'COMPLETED', reason: REASON },
      });
      expect(onNoShowCorrected).toHaveBeenCalledTimes(1);
    });

    it('does not post while the reason is too short', async () => {
      const user = userEvent.setup();
      renderWithIntl(<BookingDetailSheets {...baseProps({ sheetState: 'correct-no-show' })} />);

      await user.type(screen.getByRole('textbox'), 'curto');
      await user.click(screen.getByRole('button', { name: 'Confirmar correção' }));

      expect(correctNoShowMutateAsync).not.toHaveBeenCalled();
    });

    it.each([
      ['a 403', new ForbiddenError('no', undefined), 'correct-forbidden'],
      ['a network failure', new ApiError(0, 'Network Error'), 'correct-error'],
      ['a 5xx', new ApiError(500, 'Internal server error'), 'correct-error'],
    ])('routes %s to its banner', async (_label, error, expected) => {
      const user = userEvent.setup();
      correctNoShowMutateAsync.mockRejectedValue(error);
      const onCorrectFailed = vi.fn();
      const onNoShowCorrected = vi.fn();
      renderWithIntl(
        <BookingDetailSheets
          {...baseProps({ sheetState: 'correct-no-show', onCorrectFailed, onNoShowCorrected })}
        />,
      );

      await user.type(screen.getByRole('textbox'), REASON);
      await user.click(screen.getByRole('button', { name: 'Confirmar correção' }));

      expect(onCorrectFailed).toHaveBeenCalledWith(expected);
      expect(onNoShowCorrected).not.toHaveBeenCalled();
    });
  });
});
