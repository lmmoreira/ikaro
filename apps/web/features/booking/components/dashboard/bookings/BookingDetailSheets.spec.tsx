// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { ApiError } from '@/shared/lib/api/errors';
import { BookingDetailSheets } from './BookingDetailSheets';

const rejectBookingMutateAsync = vi.hoisted(() => vi.fn());
const requestMoreInfoMutateAsync = vi.hoisted(() => vi.fn());
const cancelBookingMutateAsync = vi.hoisted(() => vi.fn());

vi.mock('@/features/booking/hooks/useBookingMutations', () => ({
  useRejectBooking: () => ({ mutateAsync: rejectBookingMutateAsync }),
  useRequestMoreInfo: () => ({ mutateAsync: requestMoreInfoMutateAsync }),
  useCancelBooking: () => ({ mutateAsync: cancelBookingMutateAsync }),
}));

function baseProps(overrides: Partial<Parameters<typeof BookingDetailSheets>[0]> = {}) {
  return {
    bookingId: 'b-1',
    sheetState: null,
    isSubmitting: false,
    locale: 'pt-BR' as const,
    onClose: vi.fn(),
    onSubmittingStart: vi.fn(),
    onRejected: vi.fn(),
    onInfoRequested: vi.fn(),
    onCancelled: vi.fn(),
    onSettleError: vi.fn(),
    ...overrides,
  };
}

describe('BookingDetailSheets', () => {
  afterEach(() => {
    rejectBookingMutateAsync.mockReset();
    requestMoreInfoMutateAsync.mockReset();
    cancelBookingMutateAsync.mockReset();
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
});
