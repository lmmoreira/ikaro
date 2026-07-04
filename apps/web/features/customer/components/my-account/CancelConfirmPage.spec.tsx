// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { CustomerBookingDetailResponse } from '@ikaro/types';
import { ApiError } from '@/shared/lib/api/errors';
import { CancelConfirmPage } from './CancelConfirmPage';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      title: 'Cancelar agendamento?',
      irreversibleNote: 'Esta ação não pode ser desfeita.',
      confirmButton: 'Confirmar cancelamento',
      confirming: 'Cancelando...',
      backButton: 'Voltar',
      genericError: 'Não foi possível cancelar o agendamento. Tente novamente.',
    };
    return translations[key] ?? key;
  },
}));

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

    await user.click(screen.getByRole('button', { name: 'Confirmar cancelamento' }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/lavacar-bh/my-account'));
    expect(cancelBookingMock).toHaveBeenCalledWith('b1');
  });

  it('a 422 response redirects to the cancel/error page instead', async () => {
    cancelBookingMock.mockRejectedValue(new ApiError(422, 'outside window'));
    const user = userEvent.setup();
    render(<CancelConfirmPage booking={makeBooking()} tenantSlug="lavacar-bh" />);

    await user.click(screen.getByRole('button', { name: 'Confirmar cancelamento' }));

    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith('/lavacar-bh/my-account/bookings/b1/cancel/error'),
    );
  });

  it('a non-422 failure shows a visible error message and re-enables the button', async () => {
    cancelBookingMock.mockRejectedValue(new Error('network error'));
    const user = userEvent.setup();
    render(<CancelConfirmPage booking={makeBooking()} tenantSlug="lavacar-bh" />);

    await user.click(screen.getByRole('button', { name: 'Confirmar cancelamento' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível cancelar o agendamento. Tente novamente.',
    );
    expect(screen.getByRole('button', { name: 'Confirmar cancelamento' })).not.toBeDisabled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('"Voltar" calls router.back()', async () => {
    const user = userEvent.setup();
    render(<CancelConfirmPage booking={makeBooking()} tenantSlug="lavacar-bh" />);

    await user.click(screen.getByRole('button', { name: 'Voltar' }));

    expect(backMock).toHaveBeenCalledTimes(1);
  });
});
