// @vitest-environment jsdom
import { renderWithIntl } from '@/test-utils';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { StaffBookingDetailResponse } from '@ikaro/types';
import { ApiError } from '@/shared/lib/api/errors';
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

const approveBookingMutateAsync = vi.hoisted(() => vi.fn());
const cancelBookingMutateAsync = vi.hoisted(() => vi.fn());
const completeBookingMutateAsync = vi.hoisted(() => vi.fn());
const rejectBookingMutateAsync = vi.hoisted(() => vi.fn());
const requestMoreInfoMutateAsync = vi.hoisted(() => vi.fn());
const rescheduleBookingMutateAsync = vi.hoisted(() => vi.fn());
const setBookingStatus = vi.hoisted(() => vi.fn());

vi.mock('@/features/booking/hooks/useBookingMutations', () => ({
  useApproveBooking: () => ({ mutateAsync: approveBookingMutateAsync }),
  useCancelBooking: () => ({ mutateAsync: cancelBookingMutateAsync }),
  useCompleteBooking: () => ({ mutateAsync: completeBookingMutateAsync }),
  useRejectBooking: () => ({ mutateAsync: rejectBookingMutateAsync }),
  useRequestMoreInfo: () => ({ mutateAsync: requestMoreInfoMutateAsync }),
  useRescheduleBooking: () => ({ mutateAsync: rescheduleBookingMutateAsync }),
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
      },
    ],
    totalPrice: { amount: 100, currency: 'BRL' },
    totalDurationMins: 30,
    beforeServicePhotoUrls: [],
    afterServicePhotoUrls: [],
    infoRequestMessage: null,
    infoResponseMessage: null,
    approvedAt: null,
    approvedBy: null,
    rejectionReason: null,
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

  it('shows the backend validation message when rejecting with a short reason', async () => {
    rejectBookingMutateAsync.mockRejectedValue(
      new ApiError(400, 'Request body validation failed', {
        violations: [
          { field: 'reason', message: 'Too small: expected string to have >=10 characters' },
        ],
      }),
    );

    renderWithIntl(<BookingDetailPage booking={makeBooking()} tenantSlug="lavacar-bh" />);

    await userEvent.click(screen.getAllByRole('button', { name: 'Rejeitar' })[0]);
    await userEvent.type(screen.getByRole('textbox'), 'curto');
    await userEvent.click(screen.getAllByRole('button', { name: 'Rejeitar' })[1]);

    expect(
      await screen.findByText('Não foi possível rejeitar. Tente novamente.'),
    ).toBeInTheDocument();
  });

  it('shows the backend validation message when requesting more info with a short message', async () => {
    requestMoreInfoMutateAsync.mockRejectedValue(
      new ApiError(400, 'Request body validation failed', {
        violations: [
          {
            field: 'message',
            message: 'Too small: expected string to have >=20 characters',
          },
        ],
      }),
    );

    renderWithIntl(<BookingDetailPage booking={makeBooking()} tenantSlug="lavacar-bh" />);

    await userEvent.click(screen.getByRole('button', { name: 'Pedir info' }));
    await userEvent.type(screen.getByRole('textbox'), 'curto');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(
      await screen.findByText('Não foi possível enviar a solicitação. Tente novamente.'),
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
});
