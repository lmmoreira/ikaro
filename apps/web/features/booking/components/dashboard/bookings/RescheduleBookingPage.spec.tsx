// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { StaffBookingDetailResponse } from '@ikaro/types';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { ApiError } from '@/shared/lib/api/errors';
import { fetchBookingAvailability } from '@/features/booking/api/availability';
import { RescheduleBookingPage } from './RescheduleBookingPage';

vi.mock('@/features/booking/components/public/AvailabilityCarousel', () => ({
  AvailabilityCarousel: ({ onSelectDate }: { readonly onSelectDate: (date: string) => void }) => (
    <button type="button" onClick={() => onSelectDate('2026-06-17')}>
      choose date
    </button>
  ),
}));

vi.mock('@/features/booking/components/public/SlotPicker', () => ({
  SlotPicker: ({
    onSelectSlot,
  }: {
    readonly onSelectSlot: (slot: { startsAt: string; endsAt: string }) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onSelectSlot({
          startsAt: '2026-06-17T10:00:00.000Z',
          endsAt: '2026-06-17T10:30:00.000Z',
        })
      }
    >
      choose slot
    </button>
  ),
}));

vi.mock('@/features/booking/api/availability', () => ({
  fetchBookingAvailability: vi.fn(),
}));

const rescheduleBookingMutateAsync = vi.hoisted(() => vi.fn());
const setBookingStatus = vi.hoisted(() => vi.fn());

vi.mock('@/features/booking/hooks/useBookingMutations', () => ({
  useRescheduleBooking: () => ({
    mutateAsync: rescheduleBookingMutateAsync,
    isPending: false,
  }),
}));

vi.mock('@/shells/dashboard/components/topbar-status-context', () => ({
  useDashboardTopbarStatus: () => ({
    bookingStatus: null,
    setBookingStatus,
  }),
}));

function makeBooking(): StaffBookingDetailResponse {
  return {
    notes: null,
    adminNotes: null,
    createdAt: '2026-06-14T09:12:00.000Z',
    createdByName: null,
    resources: [],
    itinerary: [],
    participantCount: null,
    attendees: [],
    intake: null,
    recurringScheduleId: null,
    cancellation: null,
    rejection: null,
    hasOpenException: false,
    bookingId: 'b-1',
    status: 'APPROVED',
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
        priceAtBooking: { amount: 60, currency: 'BRL' },
        durationMinsAtBooking: 30,
        pointsValueAtBooking: 5,
        requiresPickupAddressAtBooking: false,
        actualPriceCharged: null,
      },
    ],
    totalPrice: { amount: 60, currency: 'BRL' },
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
  };
}

beforeEach(() => {
  rescheduleBookingMutateAsync.mockReset();
  setBookingStatus.mockReset();
});

describe('RescheduleBookingPage', () => {
  it('submits the selected new slot and shows the success state', async () => {
    const user = userEvent.setup();
    rescheduleBookingMutateAsync.mockResolvedValue(undefined);

    const { container } = renderWithIntl(
      <RescheduleBookingPage
        booking={makeBooking()}
        tenantSlug="lavacar-bh"
        maxBookingAdvanceDays={90}
        timezone="UTC"
        backHref="/dashboard/bookings/b-1"
        agendaHref="/dashboard/schedule?weekStart=2026-06-16&date=2026-06-16"
      />,
    );

    expect(setBookingStatus).toHaveBeenCalledWith('APPROVED');
    expect(screen.getAllByText('Cliente')).toHaveLength(2);
    await user.type(screen.getByRole('textbox'), 'Deixar carro na parte da frente');
    await user.click(screen.getByRole('button', { name: 'choose date' }));
    await user.click(screen.getByRole('button', { name: 'choose slot' }));

    const desktopAside = container.querySelector('aside.hidden');
    expect(desktopAside).not.toBeNull();
    const desktopAsideText = desktopAside?.textContent ?? '';
    expect(desktopAsideText.indexOf('Ações')).toBeLessThan(desktopAsideText.indexOf('Resumo'));
    expect(desktopAsideText).toContain('De');
    expect(desktopAsideText).toContain('Para');
    expect(desktopAsideText).toContain('16 de junho');
    expect(desktopAsideText).toContain('07:00–07:30');

    await user.click(screen.getAllByRole('button', { name: 'Reagendar' })[0]);

    expect(rescheduleBookingMutateAsync).toHaveBeenCalledWith({
      id: 'b-1',
      body: {
        scheduledAt: '2026-06-17T10:00:00.000Z',
        adminNotes: 'Deixar carro na parte da frente',
      },
    });
    expect(await screen.findByText('Agendamento reagendado')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Ver detalhe atualizado' })).not.toHaveLength(0);
    expect(screen.getAllByRole('link', { name: 'Voltar à agenda' })).not.toHaveLength(0);
    expect(setBookingStatus).toHaveBeenCalledWith('APPROVED');
  });

  it('shows an error when the form is submitted without a selected slot', async () => {
    const user = userEvent.setup();

    renderWithIntl(
      <RescheduleBookingPage
        booking={makeBooking()}
        tenantSlug="lavacar-bh"
        maxBookingAdvanceDays={90}
        timezone="UTC"
        backHref="/dashboard/bookings/b-1"
        agendaHref="/dashboard/schedule?weekStart=2026-06-16&date=2026-06-16"
      />,
    );

    await user.click(screen.getAllByRole('button', { name: 'Reagendar' })[0]);

    expect(
      await screen.findByText('Escolha um novo horário antes de continuar.'),
    ).toBeInTheDocument();
  });

  it('shows the resolved backend error message for a non-conflict rescheduling failure', async () => {
    const user = userEvent.setup();
    rescheduleBookingMutateAsync.mockRejectedValueOnce(
      new ApiError(400, 'Scheduled time is in the past', { code: 'BOOKING_SCHEDULED_IN_PAST' }),
    );

    renderWithIntl(
      <RescheduleBookingPage
        booking={makeBooking()}
        tenantSlug="lavacar-bh"
        maxBookingAdvanceDays={90}
        timezone="UTC"
        backHref="/dashboard/bookings/b-1"
        agendaHref="/dashboard/schedule?weekStart=2026-06-16&date=2026-06-16"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'choose date' }));
    await user.click(screen.getByRole('button', { name: 'choose slot' }));
    await user.click(screen.getAllByRole('button', { name: 'Reagendar' })[0]);

    expect(await screen.findByText('O novo horário deve ser no futuro.')).toBeInTheDocument();
  });

  it('shows the loading alternatives error when the conflict fallback cannot fetch slots', async () => {
    const user = userEvent.setup();
    rescheduleBookingMutateAsync.mockRejectedValueOnce(new ApiError(409, 'slot unavailable'));

    vi.mocked(fetchBookingAvailability).mockRejectedValue(new Error('network error'));

    renderWithIntl(
      <RescheduleBookingPage
        booking={makeBooking()}
        tenantSlug="lavacar-bh"
        maxBookingAdvanceDays={90}
        timezone="UTC"
        backHref="/dashboard/bookings/b-1"
        agendaHref="/dashboard/schedule?weekStart=2026-06-16&date=2026-06-16"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'choose date' }));
    await user.click(screen.getByRole('button', { name: 'choose slot' }));
    await user.click(screen.getAllByRole('button', { name: 'Reagendar' })[0]);

    expect(
      await screen.findByText('Não foi possível carregar horários alternativos.'),
    ).toBeInTheDocument();
  });

  it('says the time is closed, not occupied, when the reschedule is refused for a closure', async () => {
    const user = userEvent.setup();
    rescheduleBookingMutateAsync.mockRejectedValueOnce(
      new ApiError(409, 'closed', { code: 'BOOKING_SLOT_CLOSED' }),
    );
    vi.mocked(fetchBookingAvailability).mockResolvedValue({
      date: '2026-06-17',
      available: true,
      slots: [{ startsAt: '2026-06-17T10:00:00.000Z', endsAt: '2026-06-17T10:30:00.000Z' }],
    });

    renderWithIntl(
      <RescheduleBookingPage
        booking={makeBooking()}
        tenantSlug="lavacar-bh"
        maxBookingAdvanceDays={90}
        timezone="UTC"
        backHref="/dashboard/bookings/b-1"
        agendaHref="/dashboard/schedule?weekStart=2026-06-16&date=2026-06-16"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'choose date' }));
    await user.click(screen.getByRole('button', { name: 'choose slot' }));
    await user.click(screen.getAllByRole('button', { name: 'Reagendar' })[0]);

    expect(
      await screen.findByText('O negócio está fechado no horário solicitado.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/foi ocupado/)).not.toBeInTheDocument();
  });

  it('dismisses the conflict alert when the back action is used', async () => {
    const user = userEvent.setup();
    rescheduleBookingMutateAsync.mockRejectedValueOnce(new ApiError(409, 'slot unavailable'));

    vi.mocked(fetchBookingAvailability).mockResolvedValue({
      date: '2026-06-17',
      available: true,
      slots: [{ startsAt: '2026-06-17T10:00:00.000Z', endsAt: '2026-06-17T10:30:00.000Z' }],
    });

    renderWithIntl(
      <RescheduleBookingPage
        booking={makeBooking()}
        tenantSlug="lavacar-bh"
        maxBookingAdvanceDays={90}
        timezone="UTC"
        backHref="/dashboard/bookings/b-1"
        agendaHref="/dashboard/schedule?weekStart=2026-06-16&date=2026-06-16"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'choose date' }));
    await user.click(screen.getByRole('button', { name: 'choose slot' }));
    await user.click(screen.getAllByRole('button', { name: 'Reagendar' })[0]);

    expect(await screen.findByText('Horário não disponível')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '← Voltar sem reagendar' }));

    expect(screen.queryByText('Horário não disponível')).not.toBeInTheDocument();
  });

  it('renders the same boxed action pattern for desktop and mobile rails', () => {
    const { container } = renderWithIntl(
      <RescheduleBookingPage
        booking={makeBooking()}
        tenantSlug="lavacar-bh"
        maxBookingAdvanceDays={90}
        timezone="UTC"
        backHref="/dashboard/bookings/b-1"
        agendaHref="/dashboard/schedule?weekStart=2026-06-16&date=2026-06-16"
      />,
    );

    const actionsLabels = screen.getAllByText('Ações');
    expect(actionsLabels).toHaveLength(2);
    expect(actionsLabels[0].closest('aside')).toHaveClass('hidden');

    const mobileFooter = container.querySelector('.fixed.inset-x-0.bottom-0');
    expect(mobileFooter).toHaveTextContent('Ações');
    expect(mobileFooter?.querySelector('.rounded-lg.border')).not.toBeNull();
  });
});

describe('RescheduleBookingPage — injected confirm (the "Reservas a resolver" route)', () => {
  const baseProps = {
    tenantSlug: 'lavacar-bh',
    maxBookingAdvanceDays: 90,
    timezone: 'UTC',
    backHref: '/dashboard/scheduling-exceptions',
    agendaHref: '/dashboard/scheduling-exceptions',
  };

  async function pickSlotAndConfirm(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'choose date' }));
    await user.click(screen.getByRole('button', { name: 'choose slot' }));
    await user.click(screen.getAllByRole('button', { name: 'Reagendar' })[0]);
  }

  it('uses the injected confirm instead of PATCH /bookings/:id/reschedule, then hands over to onRescheduled', async () => {
    const user = userEvent.setup();
    const confirmReschedule = vi.fn().mockResolvedValue(undefined);
    const onRescheduled = vi.fn();
    renderWithIntl(
      <RescheduleBookingPage
        booking={makeBooking()}
        {...baseProps}
        confirmReschedule={confirmReschedule}
        onRescheduled={onRescheduled}
      />,
    );
    await user.type(screen.getByRole('textbox'), 'Box 2 em manutenção');

    await pickSlotAndConfirm(user);

    expect(confirmReschedule).toHaveBeenCalledWith({
      startsAt: '2026-06-17T10:00:00.000Z',
      adminNotes: 'Box 2 em manutenção',
    });
    expect(rescheduleBookingMutateAsync).not.toHaveBeenCalled();
    expect(onRescheduled).toHaveBeenCalledTimes(1);
    // The default success view is replaced by whatever the injected hand-over does.
    expect(screen.queryByText('Agendamento reagendado')).not.toBeInTheDocument();
  });

  it('sends no adminNotes when the notes are empty', async () => {
    const user = userEvent.setup();
    const confirmReschedule = vi.fn().mockResolvedValue(undefined);
    renderWithIntl(
      <RescheduleBookingPage
        booking={makeBooking()}
        {...baseProps}
        confirmReschedule={confirmReschedule}
      />,
    );

    await pickSlotAndConfirm(user);

    expect(confirmReschedule).toHaveBeenCalledWith({
      startsAt: '2026-06-17T10:00:00.000Z',
      adminNotes: undefined,
    });
  });

  it('still shows the default success view when only the confirm is injected', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <RescheduleBookingPage
        booking={makeBooking()}
        {...baseProps}
        confirmReschedule={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await pickSlotAndConfirm(user);

    expect(await screen.findByText('Agendamento reagendado')).toBeInTheDocument();
  });

  it('keeps the conflict flow when the injected confirm throws a 409: it loads the alternative slots', async () => {
    const user = userEvent.setup();
    const onRescheduled = vi.fn();
    vi.mocked(fetchBookingAvailability).mockResolvedValue({
      date: '2026-06-17',
      available: true,
      slots: [{ startsAt: '2026-06-17T11:00:00.000Z', endsAt: '2026-06-17T11:30:00.000Z' }],
    });
    renderWithIntl(
      <RescheduleBookingPage
        booking={makeBooking()}
        {...baseProps}
        confirmReschedule={vi
          .fn()
          .mockRejectedValue(new ApiError(409, 'slot', { code: 'BOOKING_SLOT_UNAVAILABLE' }))}
        onRescheduled={onRescheduled}
      />,
    );

    await pickSlotAndConfirm(user);

    expect(await screen.findByText('Horário não disponível')).toBeInTheDocument();
    expect(fetchBookingAvailability).toHaveBeenCalled();
    expect(onRescheduled).not.toHaveBeenCalled();
  });

  it('shows the translated message when the injected confirm fails with another code', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <RescheduleBookingPage
        booking={makeBooking()}
        {...baseProps}
        confirmReschedule={vi
          .fn()
          .mockRejectedValue(new ApiError(422, 'past', { code: 'BOOKING_SCHEDULED_IN_PAST' }))}
      />,
    );

    await pickSlotAndConfirm(user);

    expect(await screen.findByText('O novo horário deve ser no futuro.')).toBeInTheDocument();
  });
});
