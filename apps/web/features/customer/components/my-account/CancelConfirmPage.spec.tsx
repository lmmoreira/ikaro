// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { CustomerBookingDetailResponse } from '@ikaro/types';
import { ApiError } from '@/shared/lib/api/errors';
import {
  CustomerTopbarStatusProvider,
  useCustomerTopbarStatus,
} from '../customer-topbar-status-context';
import { CancelConfirmPage } from './CancelConfirmPage';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      title: 'Cancelar agendamento?',
      irreversibleNote: 'Esta ação não pode ser desfeita.',
      bookingSectionLabel: 'Agendamento',
      warningNote: 'Cancelamentos com menos de 48 horas de antecedência podem não ser aceitos.',
      confirmNote: 'Tem certeza? O agendamento será cancelado permanentemente.',
      confirmButton: 'Confirmar cancelamento',
      confirming: 'Cancelando...',
      backButton: 'Voltar',
      backToBooking: 'Agendamento',
    };
    return translations[key] ?? key;
  },
  useLocale: () => 'pt-BR',
}));

function TopbarStatusProbe(): React.JSX.Element {
  const status = useCustomerTopbarStatus();
  return (
    <div>
      <p data-testid="probe-booking-status">{status?.bookingStatus ?? 'none'}</p>
      <p data-testid="probe-back-href">{status?.backHrefOverride ?? 'none'}</p>
      <p data-testid="probe-back-label">{status?.backLabelOverride ?? 'none'}</p>
    </div>
  );
}

vi.mock('@/shared/lib/formatting/use-formatting', () => ({
  useFormatting: () => ({
    formatMoney: (amount: number) => `R$ ${amount.toFixed(2)}`,
    formatTime: () => '10:00',
    formatDateLong: () => 'Sábado, 20 de junho',
  }),
}));

const pushMock = vi.fn();
const backMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, back: backMock }),
}));

const cancelBookingMock = vi.fn();
vi.mock('../../api', () => ({
  cancelBooking: (...args: unknown[]) => cancelBookingMock(...args),
}));

function makeBooking(): CustomerBookingDetailResponse {
  return {
    bookingId: 'b1',
    status: 'APPROVED',
    scheduledAt: '2026-06-20T10:00:00.000Z',
    lines: [
      {
        lineId: 'l1',
        serviceName: 'Lavagem Completa',
        durationMinsAtBooking: 60,
        priceAtBooking: { amount: 180, currency: 'BRL' },
        actualPriceCharged: null,
      },
    ],
    totalPrice: { amount: 180, currency: 'BRL' },
    notes: null,
    cancellableUntil: '2026-06-18T10:00:00.000Z',
    infoRequestMessage: null,
    infoResponseMessage: null,
    beforeServicePhotoUrls: [],
    afterServicePhotoUrls: [],
    completedAt: null,
    totalActualPrice: null,
    discountPointsUsed: null,
    discountAmount: null,
    pointsEarned: null,
  };
}

describe('CancelConfirmPage', () => {
  beforeEach(() => {
    pushMock.mockReset();
    backMock.mockReset();
    cancelBookingMock.mockReset();
  });

  it('shows the booking summary and warning', () => {
    render(<CancelConfirmPage booking={makeBooking()} tenantSlug="lavacar-bh" />);

    expect(screen.getByText('Cancelar agendamento?')).toBeInTheDocument();
    expect(screen.getByText('Lavagem Completa')).toBeInTheDocument();
    expect(screen.getByText('R$ 180.00')).toBeInTheDocument();
  });

  it('confirming a successful cancel redirects to the my-account list', async () => {
    cancelBookingMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<CancelConfirmPage booking={makeBooking()} tenantSlug="lavacar-bh" />);

    // Rendered twice: once inline for mobile, once in the sticky desktop sidebar.
    const desktopPane = screen.getByTestId('action-pane-desktop');
    await user.click(within(desktopPane).getByRole('button', { name: 'Confirmar cancelamento' }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/lavacar-bh/my-account'));
    expect(cancelBookingMock).toHaveBeenCalledWith('b1');
  });

  it('a cancellation-window-expired failure redirects to the cancel/error page', async () => {
    cancelBookingMock.mockRejectedValue(
      new ApiError(422, 'outside window', { code: 'BOOKING_CANCELLATION_WINDOW_EXPIRED' }),
    );
    const user = userEvent.setup();
    render(<CancelConfirmPage booking={makeBooking()} tenantSlug="lavacar-bh" />);

    const desktopPane = screen.getByTestId('action-pane-desktop');
    await user.click(within(desktopPane).getByRole('button', { name: 'Confirmar cancelamento' }));

    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith('/lavacar-bh/my-account/bookings/b1/cancel/error'),
    );
  });

  it('an invalid-transition 422 (e.g. booking already completed) shows an inline message instead of redirecting', async () => {
    cancelBookingMock.mockRejectedValue(
      new ApiError(422, 'invalid transition', { code: 'BOOKING_INVALID_TRANSITION' }),
    );
    const user = userEvent.setup();
    render(<CancelConfirmPage booking={makeBooking()} tenantSlug="lavacar-bh" />);

    const desktopPane = screen.getByTestId('action-pane-desktop');
    await user.click(within(desktopPane).getByRole('button', { name: 'Confirmar cancelamento' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não é possível alterar o status do agendamento para o status solicitado.',
    );
    expect(pushMock).not.toHaveBeenCalledWith('/lavacar-bh/my-account/bookings/b1/cancel/error');
  });

  it('shows a generic fallback message and re-enables the button for a failure with no recognizable code', async () => {
    cancelBookingMock.mockRejectedValue(new Error('network error'));
    const user = userEvent.setup();
    render(<CancelConfirmPage booking={makeBooking()} tenantSlug="lavacar-bh" />);

    const desktopPane = screen.getByTestId('action-pane-desktop');
    await user.click(within(desktopPane).getByRole('button', { name: 'Confirmar cancelamento' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Algo deu errado. Tente novamente.');
    expect(
      within(desktopPane).getByRole('button', { name: 'Confirmar cancelamento' }),
    ).not.toBeDisabled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('"Voltar" calls router.back()', async () => {
    const user = userEvent.setup();
    render(<CancelConfirmPage booking={makeBooking()} tenantSlug="lavacar-bh" />);

    const desktopPane = screen.getByTestId('action-pane-desktop');
    await user.click(within(desktopPane).getByRole('button', { name: 'Voltar' }));

    expect(backMock).toHaveBeenCalledTimes(1);
  });

  it('syncs the booking status and back link to the shared topbar context', () => {
    render(
      <CustomerTopbarStatusProvider>
        <TopbarStatusProbe />
        <CancelConfirmPage booking={makeBooking()} tenantSlug="lavacar-bh" />
      </CustomerTopbarStatusProvider>,
    );

    expect(screen.getByTestId('probe-booking-status')).toHaveTextContent('APPROVED');
    expect(screen.getByTestId('probe-back-href')).toHaveTextContent(
      '/lavacar-bh/my-account/bookings/b1',
    );
    expect(screen.getByTestId('probe-back-label')).toHaveTextContent('Agendamento');
  });
});
