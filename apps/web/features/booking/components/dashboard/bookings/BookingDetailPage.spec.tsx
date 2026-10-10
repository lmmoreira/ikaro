// @vitest-environment jsdom
import { renderWithIntl } from '@/test-utils';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import type { StaffBookingDetailResponse } from '@ikaro/types';
import { ApiError, ForbiddenError } from '@/shared/lib/api/errors';
import { TenantProvider } from '@/providers/tenant-provider';
import { getBooking } from '@/features/booking/api/booking';
import { fetchBookingAvailability } from '@/features/booking/api/availability';
import { BookingDetailPage } from './BookingDetailPage';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const routerPush = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: routerPush,
  }),
}));

vi.mock('@/features/booking/api/availability', () => ({
  fetchBookingAvailability: vi.fn(),
}));

vi.mock('@/features/booking/api/booking', () => ({
  getBooking: vi.fn(),
}));

const approveBookingMutateAsync = vi.hoisted(() => vi.fn());
const cancelBookingMutateAsync = vi.hoisted(() => vi.fn());
const completeBookingMutateAsync = vi.hoisted(() => vi.fn());
const rejectBookingMutateAsync = vi.hoisted(() => vi.fn());
const requestMoreInfoMutateAsync = vi.hoisted(() => vi.fn());
const rescheduleBookingMutateAsync = vi.hoisted(() => vi.fn());
const markNoShowMutateAsync = vi.hoisted(() => vi.fn());
const correctNoShowMutateAsync = vi.hoisted(() => vi.fn());
const setBookingStatus = vi.hoisted(() => vi.fn());

vi.mock('@/features/booking/hooks/useBookingMutations', () => ({
  useApproveBooking: () => ({ mutateAsync: approveBookingMutateAsync }),
  useCancelBooking: () => ({ mutateAsync: cancelBookingMutateAsync }),
  useCompleteBooking: () => ({ mutateAsync: completeBookingMutateAsync }),
  useRejectBooking: () => ({ mutateAsync: rejectBookingMutateAsync }),
  useRequestMoreInfo: () => ({ mutateAsync: requestMoreInfoMutateAsync }),
  useRescheduleBooking: () => ({ mutateAsync: rescheduleBookingMutateAsync }),
  useMarkNoShow: () => ({ mutateAsync: markNoShowMutateAsync }),
  useCorrectNoShow: () => ({ mutateAsync: correctNoShowMutateAsync }),
}));

vi.mock('@/shells/dashboard/components/topbar-status-context', () => ({
  useDashboardTopbarStatus: () => ({
    bookingStatus: null,
    setBookingStatus,
  }),
}));

function makeBooking(overrides?: Partial<StaffBookingDetailResponse>): StaffBookingDetailResponse {
  return {
    bookingId: 'b-1',
    status: 'PENDING',
    scheduledAt: '2026-06-16T10:00:00.000Z',
    type: 'CUSTOMER',
    contactName: 'João Silva',
    contactEmail: 'joao@example.com',
    contactPhone: '+5531999999999',
    contactAddress: null,
    pickupAddress: null,
    customerId: 'c-1',
    loyaltyBalance: 240,
    lines: [
      {
        lineId: 'l-1',
        serviceId: 'svc-1',
        serviceName: 'Lavagem Simples',
        priceAtBooking: { amount: 100, currency: 'BRL' },
        durationMinsAtBooking: 30,
        pointsValueAtBooking: 5,
        requiresPickupAddressAtBooking: false,
        actualPriceCharged: null,
      },
    ],
    totalPrice: { amount: 100, currency: 'BRL' },
    totalActualPrice: null,
    discountPointsUsed: null,
    discountAmount: null,
    totalDurationMins: 30,
    beforeServicePhotoUrls: [],
    afterServicePhotoUrls: [],
    beforeServicePhotoPaths: [],
    afterServicePhotoPaths: [],
    infoRequestMessage: null,
    infoResponseMessage: null,
    approvedAt: null,
    approvedBy: null,
    completedAt: null,
    rejectionReason: null,
    statusHistory: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(fetchBookingAvailability).mockReset();
  routerPush.mockReset();
  approveBookingMutateAsync.mockReset();
  cancelBookingMutateAsync.mockReset();
  completeBookingMutateAsync.mockReset();
  rejectBookingMutateAsync.mockReset();
  requestMoreInfoMutateAsync.mockReset();
  rescheduleBookingMutateAsync.mockReset();
  setBookingStatus.mockReset();
  markNoShowMutateAsync.mockReset();
  correctNoShowMutateAsync.mockReset();
  vi.mocked(getBooking).mockReset();
});

describe('BookingDetailPage', () => {
  it('updates the topbar booking status after approval', async () => {
    approveBookingMutateAsync.mockResolvedValue({
      bookingId: 'b-1',
      status: 'APPROVED',
      approvedAt: '2026-06-16T10:05:00.000Z',
    });

    renderWithIntl(<BookingDetailPage booking={makeBooking()} tenantSlug="lavacar-bh" />);

    await userEvent.click(screen.getByRole('button', { name: 'Aprovar' }));

    expect(await screen.findByText('Agendamento aprovado!')).toBeInTheDocument();
    expect(setBookingStatus).toHaveBeenCalledWith('APPROVED');
  });

  it('approves inline and updates the badge', async () => {
    approveBookingMutateAsync.mockResolvedValue({
      bookingId: 'b-1',
      status: 'APPROVED',
      approvedAt: '2026-06-16T10:05:00.000Z',
    });

    renderWithIntl(<BookingDetailPage booking={makeBooking()} tenantSlug="lavacar-bh" />);

    await userEvent.click(screen.getByRole('button', { name: 'Aprovar' }));

    expect(await screen.findByText('Agendamento aprovado!')).toBeInTheDocument();
    expect(screen.getByText('Aprovado')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aprovar' })).not.toBeInTheDocument();
  });

  it('shows slot suggestions after a 409 and retries with the selected slot', async () => {
    approveBookingMutateAsync
      .mockRejectedValueOnce(new ApiError(409, 'slot unavailable'))
      .mockResolvedValueOnce({
        bookingId: 'b-1',
        status: 'APPROVED',
        approvedAt: '2026-06-16T09:05:00.000Z',
      });
    vi.mocked(fetchBookingAvailability).mockResolvedValue({
      date: '2026-06-16',
      slots: [{ startsAt: '2026-06-16T09:00:00.000Z', endsAt: '2026-06-16T09:30:00.000Z' }],
      available: true,
    });

    renderWithIntl(<BookingDetailPage booking={makeBooking()} tenantSlug="lavacar-bh" />);

    await userEvent.click(screen.getByRole('button', { name: 'Aprovar' }));

    expect(await screen.findByText('Horário não disponível')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Aprovar neste/ }));

    expect(await screen.findByText('Agendamento aprovado!')).toBeInTheDocument();
    expect(approveBookingMutateAsync).toHaveBeenNthCalledWith(2, {
      id: 'b-1',
      body: {
        scheduledAt: '2026-06-16T09:00:00.000Z',
      },
    });
  });

  it('opens directly on the slot-conflict state when initialized from the queue shortcut', async () => {
    vi.mocked(fetchBookingAvailability).mockResolvedValue({
      date: '2026-06-16',
      slots: [{ startsAt: '2026-06-16T09:00:00.000Z', endsAt: '2026-06-16T09:30:00.000Z' }],
      available: true,
    });

    renderWithIntl(
      <BookingDetailPage
        booking={makeBooking()}
        tenantSlug="lavacar-bh"
        initialActionState="slot-conflict"
      />,
    );

    expect(await screen.findByText('Horário não disponível')).toBeInTheDocument();
    expect(vi.mocked(fetchBookingAvailability)).toHaveBeenCalledWith('lavacar-bh', '2026-06-16', [
      'svc-1',
    ]);
    expect(screen.getByText('Aprovar neste →')).toBeInTheDocument();
  });

  it('preserves the schedule return target when opening complete flow actions', async () => {
    const user = userEvent.setup();
    const returnTo = '/dashboard/schedule?weekStart=2026-07-01&date=2026-07-02';

    renderWithIntl(
      <BookingDetailPage
        booking={makeBooking({ status: 'APPROVED' })}
        tenantSlug="lavacar-bh"
        returnTo={returnTo}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Marcar concluído' }));

    expect(routerPush).toHaveBeenCalledWith(
      `/dashboard/bookings/b-1/complete?returnTo=${encodeURIComponent(returnTo)}`,
    );
  });

  it('shows the resolved backend validation message when rejecting with a short reason', async () => {
    rejectBookingMutateAsync.mockRejectedValue(
      new ApiError(400, 'Request body validation failed', {
        violations: [{ field: 'reason', code: 'GENERIC_VALUE_TOO_SHORT', params: { minimum: 10 } }],
      }),
    );

    renderWithIntl(<BookingDetailPage booking={makeBooking()} tenantSlug="lavacar-bh" />);

    await userEvent.click(screen.getAllByRole('button', { name: 'Rejeitar' })[0]);
    await userEvent.type(screen.getByRole('textbox'), 'curto');
    await userEvent.click(screen.getAllByRole('button', { name: 'Rejeitar' })[1]);

    expect(
      await screen.findByText('Este valor deve ter no mínimo 10 caracteres.'),
    ).toBeInTheDocument();
  });

  it('shows the resolved backend validation message when requesting more info with a short message', async () => {
    requestMoreInfoMutateAsync.mockRejectedValue(
      new ApiError(400, 'Request body validation failed', {
        violations: [
          { field: 'message', code: 'GENERIC_VALUE_TOO_SHORT', params: { minimum: 20 } },
        ],
      }),
    );

    renderWithIntl(<BookingDetailPage booking={makeBooking()} tenantSlug="lavacar-bh" />);

    await userEvent.click(screen.getByRole('button', { name: 'Pedir info' }));
    await userEvent.type(screen.getByRole('textbox'), 'curto');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(
      await screen.findByText('Este valor deve ter no mínimo 20 caracteres.'),
    ).toBeInTheDocument();
  });

  it('hides request info when the booking is already awaiting info', () => {
    renderWithIntl(
      <BookingDetailPage
        booking={makeBooking({ status: 'INFO_REQUESTED' })}
        tenantSlug="lavacar-bh"
      />,
    );

    expect(screen.getByRole('button', { name: 'Aprovar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rejeitar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pedir info' })).not.toBeInTheDocument();
  });

  it('renders approved lifecycle actions when the booking is already approved', () => {
    renderWithIntl(
      <BookingDetailPage booking={makeBooking({ status: 'APPROVED' })} tenantSlug="lavacar-bh" />,
    );

    expect(screen.getByRole('button', { name: 'Marcar concluído' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reagendar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar agendamento' })).toBeInTheDocument();
  });

  it('renders the approved gallery and routes the action buttons', async () => {
    const user = userEvent.setup();

    renderWithIntl(
      <BookingDetailPage
        booking={makeBooking({
          status: 'APPROVED',
          afterServicePhotoUrls: ['https://example.com/photo.jpg'],
        })}
        tenantSlug="lavacar-bh"
      />,
    );

    expect(screen.getByRole('img', { name: 'Foto depois do serviço 1' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Marcar concluído' }));
    expect(routerPush).toHaveBeenCalledWith('/dashboard/bookings/b-1/complete');

    await user.click(screen.getByRole('button', { name: 'Reagendar' }));
    expect(routerPush).toHaveBeenCalledWith('/dashboard/bookings/b-1/reschedule');
  });

  it('shows the rejection success state after a successful reject', async () => {
    const user = userEvent.setup();
    rejectBookingMutateAsync.mockResolvedValue(undefined);

    renderWithIntl(<BookingDetailPage booking={makeBooking()} tenantSlug="lavacar-bh" />);

    await user.click(screen.getAllByRole('button', { name: 'Rejeitar' })[0]);
    await user.type(screen.getByRole('textbox'), 'Cliente pediu cancelamento');
    await user.click(screen.getAllByRole('button', { name: 'Rejeitar' })[1]);

    expect(await screen.findByText('Agendamento rejeitado')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Voltar à agenda' })).toBeInTheDocument();
  });

  it('shows the information-request success state after a successful request', async () => {
    const user = userEvent.setup();
    requestMoreInfoMutateAsync.mockResolvedValue(undefined);

    renderWithIntl(<BookingDetailPage booking={makeBooking()} tenantSlug="lavacar-bh" />);

    await user.click(screen.getByRole('button', { name: 'Pedir info' }));
    await user.type(screen.getByRole('textbox'), 'Confirmar endereço de coleta');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(await screen.findByText('Solicitação de informação enviada')).toBeInTheDocument();
    expect(screen.getByText(/Pergunta enviada:/)).toBeInTheDocument();
  });

  it('hides actions for terminal bookings', () => {
    renderWithIntl(
      <BookingDetailPage booking={makeBooking({ status: 'REJECTED' })} tenantSlug="lavacar-bh" />,
    );

    expect(screen.queryByRole('button', { name: 'Marcar concluído' })).not.toBeInTheDocument();
    expect(screen.queryByText('Ações')).not.toBeInTheDocument();
  });

  it('shows the charge and loyalty discount summary when reopening a completed booking', () => {
    renderWithIntl(
      <BookingDetailPage
        booking={makeBooking({
          status: 'COMPLETED',
          totalActualPrice: { amount: 76, currency: 'BRL' },
          discountPointsUsed: 240,
          discountAmount: { amount: 24, currency: 'BRL' },
          lines: [
            {
              lineId: 'l-1',
              serviceId: 'svc-1',
              serviceName: 'Lavagem Simples',
              priceAtBooking: { amount: 100, currency: 'BRL' },
              durationMinsAtBooking: 30,
              pointsValueAtBooking: 5,
              requiresPickupAddressAtBooking: false,
              actualPriceCharged: { amount: 76, currency: 'BRL' },
            },
          ],
        })}
        tenantSlug="lavacar-bh"
      />,
    );

    expect(screen.getByTestId('booking-completed-title')).toBeInTheDocument();
    expect(screen.getByText('Total cotado: R$ 100,00')).toBeInTheDocument();
    expect(screen.getByText('Total cobrado: R$ 76,00')).toBeInTheDocument();
    expect(screen.getByTestId('complete-loyalty-discount-applied')).toHaveTextContent(
      'Desconto fidelidade: -R$ 24,00',
    );
    expect(screen.getByRole('link', { name: 'Voltar à agenda' })).toBeInTheDocument();
  });

  it('falls back to the quoted total when a completed booking has no discount', () => {
    renderWithIntl(
      <BookingDetailPage booking={makeBooking({ status: 'COMPLETED' })} tenantSlug="lavacar-bh" />,
    );

    expect(screen.getByTestId('booking-completed-title')).toBeInTheDocument();
    expect(screen.queryByTestId('complete-loyalty-discount-applied')).not.toBeInTheDocument();
  });

  it('returns to the default state when the slot-conflict alert is dismissed', async () => {
    const user = userEvent.setup();
    approveBookingMutateAsync
      .mockRejectedValueOnce(new ApiError(409, 'slot unavailable'))
      .mockResolvedValueOnce({
        bookingId: 'b-1',
        status: 'APPROVED',
        approvedAt: '2026-06-16T09:05:00.000Z',
      });
    vi.mocked(fetchBookingAvailability).mockResolvedValue({
      date: '2026-06-16',
      slots: [{ startsAt: '2026-06-16T09:00:00.000Z', endsAt: '2026-06-16T09:30:00.000Z' }],
      available: true,
    });

    renderWithIntl(<BookingDetailPage booking={makeBooking()} tenantSlug="lavacar-bh" />);

    await user.click(screen.getByRole('button', { name: 'Aprovar' }));

    expect(await screen.findByText('Horário não disponível')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: '← Voltar sem aprovar' })[0]);

    expect(screen.queryByText('Horário não disponível')).not.toBeInTheDocument();
  });

  it('shows the cancel success state with the back-to-agenda action', async () => {
    const user = userEvent.setup();
    cancelBookingMutateAsync.mockResolvedValue({
      bookingId: 'b-1',
      status: 'CANCELLED',
      cancelledAt: '2026-06-16T10:05:00.000Z',
    });

    renderWithIntl(
      <BookingDetailPage booking={makeBooking({ status: 'APPROVED' })} tenantSlug="lavacar-bh" />,
    );

    await user.click(screen.getAllByRole('button', { name: 'Cancelar agendamento' })[0]);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar agendamento' }));

    expect(await screen.findByText('Agendamento cancelado')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Voltar à agenda' })).toBeInTheDocument();
  });

  describe('no-show (UC-074)', () => {
    // 10:00–10:30 UTC: ended at the first time, not yet ended at the second.
    const AFTER_END = new Date('2026-06-16T12:00:00.000Z');
    const BEFORE_END = new Date('2026-06-16T09:00:00.000Z');

    afterEach(() => {
      vi.useRealTimers();
    });

    function renderAt(
      now: Date,
      booking: StaffBookingDetailResponse,
      role: 'STAFF' | 'MANAGER' = 'STAFF',
    ) {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(now);
      return renderWithIntl(
        <TenantProvider tenantId="t-1" tenantSlug="lavacar-bh" role={role}>
          <BookingDetailPage booking={booking} tenantSlug="lavacar-bh" />
        </TenantProvider>,
      );
    }

    const approved = () => makeBooking({ status: 'APPROVED' });
    const noShow = (overrides?: Partial<StaffBookingDetailResponse>) =>
      makeBooking({
        status: 'NO_SHOW',
        statusHistory: [
          {
            fromStatus: 'APPROVED',
            toStatus: 'NO_SHOW',
            reason: 'Cliente não atendeu o telefone.',
            actorType: 'MANAGER',
            actorId: 'staff-1',
            actorName: 'Ana Pereira',
            occurredAt: '2026-06-16T10:42:00.000Z',
          },
        ],
        ...overrides,
      });

    async function markNoShow(user: ReturnType<typeof userEvent.setup>) {
      await user.click(screen.getByRole('button', { name: 'Marcar não compareceu' }));
      await user.click(screen.getByRole('button', { name: 'Confirmar não comparecimento' }));
    }

    it('marks a no-show after the end time and shows the success state, then the re-read history', async () => {
      const user = userEvent.setup();
      markNoShowMutateAsync.mockResolvedValue({ bookingId: 'b-1', status: 'NO_SHOW' });
      vi.mocked(getBooking).mockResolvedValue(noShow());
      renderAt(AFTER_END, approved());

      await user.click(screen.getByRole('button', { name: 'Marcar não compareceu' }));
      await user.type(screen.getByRole('textbox'), 'Cliente não atendeu o telefone.');
      await user.click(screen.getByRole('button', { name: 'Confirmar não comparecimento' }));

      expect(markNoShowMutateAsync).toHaveBeenCalledWith({
        id: 'b-1',
        body: { reason: 'Cliente não atendeu o telefone.' },
      });
      expect(await screen.findByTestId('booking-no-show-marked')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Voltar à agenda' })).toBeInTheDocument();
      expect(
        await screen.findByText(/Motivo: Cliente não atendeu o telefone\./),
      ).toBeInTheDocument();
    });

    it('marks a no-show without a reason as an empty request', async () => {
      const user = userEvent.setup();
      markNoShowMutateAsync.mockResolvedValue({ bookingId: 'b-1', status: 'NO_SHOW' });
      vi.mocked(getBooking).mockResolvedValue(noShow());
      renderAt(AFTER_END, approved());

      await markNoShow(user);

      expect(markNoShowMutateAsync).toHaveBeenCalledWith({ id: 'b-1' });
    });

    it('disables the action before the end time with the hint', () => {
      renderAt(BEFORE_END, approved());

      expect(screen.getByRole('button', { name: 'Marcar não compareceu' })).toBeDisabled();
      expect(screen.getByText(/Disponível após o término do atendimento \(/)).toBeInTheDocument();
    });

    it('shows the already-closed banner on a 409 and re-reads the booking', async () => {
      const user = userEvent.setup();
      markNoShowMutateAsync.mockRejectedValue(
        new ApiError(409, 'closed', { code: 'BOOKING_ALREADY_TERMINAL' }),
      );
      vi.mocked(getBooking).mockResolvedValue(makeBooking({ status: 'COMPLETED' }));
      renderAt(AFTER_END, approved());

      await markNoShow(user);

      expect(await screen.findByTestId('booking-no-show-terminal')).toBeInTheDocument();
      expect(getBooking).toHaveBeenCalledWith('b-1');
      // The re-read shows what the booking is now: the status badge and the action rail follow it.
      expect(await screen.findByText('Concluído')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Marcar não compareceu' }),
      ).not.toBeInTheDocument();
    });

    it('shows the not-yet-ended banner on a 422 and leaves the booking approved', async () => {
      const user = userEvent.setup();
      markNoShowMutateAsync.mockRejectedValue(
        new ApiError(422, 'early', { code: 'BOOKING_NOT_YET_ENDED' }),
      );
      renderAt(AFTER_END, approved());

      await markNoShow(user);

      expect(await screen.findByTestId('booking-no-show-not-ended')).toBeInTheDocument();
      expect(getBooking).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Marcar não compareceu' })).toBeEnabled();
    });

    it('shows the retry banner on a network failure and retrying reopens the sheet', async () => {
      const user = userEvent.setup();
      markNoShowMutateAsync.mockRejectedValue(new ApiError(0, 'Network Error'));
      renderAt(AFTER_END, approved());

      await markNoShow(user);
      expect(await screen.findByTestId('booking-no-show-error')).toBeInTheDocument();
      expect(getBooking).not.toHaveBeenCalled();

      await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
      expect(
        screen.getByRole('button', { name: 'Confirmar não comparecimento' }),
      ).toBeInTheDocument();
    });

    it('shows the history card and the correction button to a manager on a NO_SHOW booking', () => {
      renderAt(AFTER_END, noShow(), 'MANAGER');

      expect(screen.getByText('Histórico de status')).toBeInTheDocument();
      expect(screen.getByText(/Ana Pereira \(Gerente\)/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Corrigir para concluído' })).toBeInTheDocument();
    });

    it('hides the correction button from staff on a NO_SHOW booking', () => {
      renderAt(AFTER_END, noShow(), 'STAFF');

      expect(screen.getByText('Histórico de status')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Corrigir para concluído' }),
      ).not.toBeInTheDocument();
    });

    it('does not show a history card for a booking that never was a no-show', () => {
      renderAt(AFTER_END, makeBooking({ status: 'COMPLETED' }));

      expect(screen.queryByText('Histórico de status')).not.toBeInTheDocument();
    });

    it('corrects a no-show to completed and names the points awarded', async () => {
      const user = userEvent.setup();
      correctNoShowMutateAsync.mockResolvedValue({ bookingId: 'b-1', status: 'COMPLETED' });
      vi.mocked(getBooking).mockResolvedValue(makeBooking({ status: 'COMPLETED' }));
      renderAt(AFTER_END, noShow(), 'MANAGER');

      await user.click(screen.getByRole('button', { name: 'Corrigir para concluído' }));
      expect(screen.getByRole('button', { name: 'Confirmar correção' })).toBeDisabled();
      await user.type(screen.getByRole('textbox'), 'Cliente chegou atrasado e foi atendido.');
      await user.click(screen.getByRole('button', { name: 'Confirmar correção' }));

      expect(correctNoShowMutateAsync).toHaveBeenCalledWith({
        id: 'b-1',
        body: { correctedStatus: 'COMPLETED', reason: 'Cliente chegou atrasado e foi atendido.' },
      });
      expect(await screen.findByTestId('booking-no-show-corrected')).toHaveTextContent(
        'João Silva recebeu 5 pontos de fidelidade (Lavagem Simples)',
      );
    });

    it('shows the manager-only banner on a 403 and leaves the booking a no-show', async () => {
      const user = userEvent.setup();
      correctNoShowMutateAsync.mockRejectedValue(new ForbiddenError('no', undefined));
      renderAt(AFTER_END, noShow(), 'MANAGER');

      await user.click(screen.getByRole('button', { name: 'Corrigir para concluído' }));
      await user.type(screen.getByRole('textbox'), 'Cliente chegou atrasado e foi atendido.');
      await user.click(screen.getByRole('button', { name: 'Confirmar correção' }));

      expect(await screen.findByTestId('booking-no-show-correct-forbidden')).toBeInTheDocument();
      expect(screen.getByText('Histórico de status')).toBeInTheDocument();
      expect(getBooking).not.toHaveBeenCalled();
    });

    it('shows the retry banner when the correction fails on the network', async () => {
      const user = userEvent.setup();
      correctNoShowMutateAsync.mockRejectedValue(new ApiError(0, 'Network Error'));
      renderAt(AFTER_END, noShow(), 'MANAGER');

      await user.click(screen.getByRole('button', { name: 'Corrigir para concluído' }));
      await user.type(screen.getByRole('textbox'), 'Cliente chegou atrasado e foi atendido.');
      await user.click(screen.getByRole('button', { name: 'Confirmar correção' }));

      expect(await screen.findByTestId('booking-no-show-correct-error')).toBeInTheDocument();
    });
  });
});
