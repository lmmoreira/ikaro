// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  StaffBookingListResponse,
  ScheduleClosureListResponse,
  ScheduleOpeningListResponse,
  ScheduleClosure,
  ScheduleOpening,
  StaffBookingCardResponse,
  TenantBusinessHours,
} from '@ikaro/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { SCHEDULE_BOOKING_TIMELINE_CLASSES } from '@/features/booking/model/booking-status';
import { SchedulePage } from './SchedulePage';

const scheduleHooks = vi.hoisted(() => ({
  useScheduleClosures: vi.fn(),
  useScheduleOpenings: vi.fn(),
  useWeekBookings: vi.fn(),
  useCreateClosure: vi.fn(),
  useCreateOpening: vi.fn(),
  useRemoveClosure: vi.fn(),
  useRemoveOpening: vi.fn(),
}));

vi.mock('@/features/booking/schedule/useSchedule', () => scheduleHooks);

vi.mock('@/features/booking/components/dashboard/bookings/BookingActionSheetShell', () => ({
  BookingActionSheetShell: ({
    children,
    onClose,
    onSubmit,
    cancelLabel,
    submitLabel,
    title,
    description,
    error,
  }: {
    children: React.ReactNode;
    onClose: () => void;
    onSubmit: (event: React.FormEvent<HTMLFormElement>) => void | Promise<void>;
    cancelLabel: string;
    submitLabel: string;
    title: React.ReactNode;
    description: React.ReactNode;
    error: string | null;
  }) => (
    <form onSubmit={onSubmit}>
      <h2>{title}</h2>
      <p>{description}</p>
      {children}
      {error ? <p>{error}</p> : null}
      <button type="button" onClick={onClose}>
        {cancelLabel}
      </button>
      <button type="submit">{submitLabel}</button>
    </form>
  ),
}));

function emptyClosures(): ScheduleClosureListResponse {
  return { items: [] };
}

function emptyOpenings(): ScheduleOpeningListResponse {
  return { items: [] };
}

function openingsWith(items: ScheduleOpening[]): ScheduleOpeningListResponse {
  return { items };
}

function closuresWith(items: ScheduleClosure[]): ScheduleClosureListResponse {
  return { items };
}

function emptyBookings(): StaffBookingListResponse {
  return { items: [], total: 0, page: 1, limit: 25 };
}

function makeBookingCard(
  overrides: Partial<StaffBookingCardResponse> = {},
): StaffBookingCardResponse {
  return {
    bookingId: '019f0ea9-eda7-7dad-9f4e-9f33f9fa5f44',
    status: 'APPROVED',
    scheduledAt: '2026-06-30T00:00:00.000Z',
    contactName: 'Alice',
    serviceNames: ['Lavagem completa'],
    totalPrice: { amount: 100, currency: 'BRL' },
    totalDurationMins: 60,
    isCustomer: false,
    ...overrides,
  };
}

function makeBusinessHours(open: boolean): TenantBusinessHours {
  return {
    timezone: 'America/Sao_Paulo',
    monday: open ? { open: '09:00', close: '18:00' } : null,
    tuesday: null,
    wednesday: null,
    thursday: null,
    friday: null,
    saturday: null,
    sunday: null,
  };
}

function mockMatchMedia(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  mockMatchMedia(false);
  scheduleHooks.useScheduleClosures.mockReturnValue({ data: emptyClosures() });
  scheduleHooks.useScheduleOpenings.mockReturnValue({ data: emptyOpenings() });
  scheduleHooks.useWeekBookings.mockReturnValue({ data: emptyBookings() });
  scheduleHooks.useCreateClosure.mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue({}) });
  scheduleHooks.useCreateOpening.mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue({}) });
  scheduleHooks.useRemoveClosure.mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
  });
  scheduleHooks.useRemoveOpening.mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
  });
});

describe('SchedulePage', () => {
  it('opens the closure sheet for a regular open day', async () => {
    const user = userEvent.setup();

    renderWithIntl(
      <SchedulePage
        initialClosures={emptyClosures()}
        initialOpenings={emptyOpenings()}
        initialBookings={emptyBookings()}
        businessHours={makeBusinessHours(true)}
        todayKey="2026-07-06"
        weekStartKey="2026-07-06"
        slotGranularityMinutes={30}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Bloquear período' }));

    expect(screen.getByRole('button', { name: 'Bloquear' })).toBeInTheDocument();
  });

  it('opens the special opening sheet for a closed day', async () => {
    const user = userEvent.setup();

    renderWithIntl(
      <SchedulePage
        initialClosures={emptyClosures()}
        initialOpenings={emptyOpenings()}
        initialBookings={emptyBookings()}
        businessHours={makeBusinessHours(false)}
        todayKey="2026-07-06"
        weekStartKey="2026-07-06"
        slotGranularityMinutes={30}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Abrir dia especial' }));

    expect(screen.getByRole('button', { name: 'Abrir dia' })).toBeInTheDocument();
  });

  it('renders the week grid on desktop browsers', async () => {
    const user = userEvent.setup();
    mockMatchMedia(true);

    renderWithIntl(
      <SchedulePage
        initialClosures={emptyClosures()}
        initialOpenings={emptyOpenings()}
        initialBookings={emptyBookings()}
        businessHours={makeBusinessHours(true)}
        todayKey="2026-07-06"
        weekStartKey="2026-07-06"
        slotGranularityMinutes={30}
      />,
    );

    expect(await screen.findByTestId('schedule-week-view')).toBeInTheDocument();
    expect(screen.queryByTestId('schedule-mobile-view')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('schedule-week-day-card')).toHaveLength(7);

    await user.click(screen.getByRole('combobox', { name: 'Visualização' }));
    await user.click(screen.getByRole('option', { name: 'Dia' }));

    expect(screen.getByTestId('schedule-mobile-view')).toBeInTheDocument();
    expect(screen.queryByTestId('schedule-week-view')).not.toBeInTheDocument();
  });

  it('restores the last selected visual mode from browser storage', async () => {
    const user = userEvent.setup();
    mockMatchMedia(false);

    const { unmount } = renderWithIntl(
      <SchedulePage
        initialClosures={emptyClosures()}
        initialOpenings={emptyOpenings()}
        initialBookings={emptyBookings()}
        businessHours={makeBusinessHours(true)}
        todayKey="2026-07-06"
        weekStartKey="2026-07-06"
        slotGranularityMinutes={30}
      />,
    );

    expect(screen.getByTestId('schedule-mobile-view')).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: 'Visualização' }));
    await user.click(screen.getByRole('option', { name: 'Semana' }));

    expect(screen.getByTestId('schedule-week-view')).toBeInTheDocument();

    unmount();

    renderWithIntl(
      <SchedulePage
        initialClosures={emptyClosures()}
        initialOpenings={emptyOpenings()}
        initialBookings={emptyBookings()}
        businessHours={makeBusinessHours(true)}
        todayKey="2026-07-06"
        weekStartKey="2026-07-06"
        slotGranularityMinutes={30}
      />,
    );

    expect(await screen.findByTestId('schedule-week-view')).toBeInTheDocument();
  });

  it('jumps back to today when the today button is clicked', async () => {
    const user = userEvent.setup();

    renderWithIntl(
      <SchedulePage
        initialClosures={emptyClosures()}
        initialOpenings={emptyOpenings()}
        initialBookings={emptyBookings()}
        businessHours={makeBusinessHours(true)}
        todayKey="2026-06-29"
        weekStartKey="2026-06-22"
        initialSelectedDateKey="2026-06-22"
        slotGranularityMinutes={30}
      />,
    );

    expect(screen.getByRole('heading', { name: /22 de junho/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Hoje' }));

    expect(screen.getByRole('heading', { name: /29 de junho/i })).toBeInTheDocument();
  });

  it('creates a closure from the open-day sheet', async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue({ id: 'closure-1' });
    scheduleHooks.useCreateClosure.mockReturnValue({ mutateAsync });

    renderWithIntl(
      <SchedulePage
        initialClosures={emptyClosures()}
        initialOpenings={emptyOpenings()}
        initialBookings={emptyBookings()}
        businessHours={makeBusinessHours(true)}
        todayKey="2026-06-29"
        weekStartKey="2026-06-29"
        slotGranularityMinutes={30}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Bloquear período' }));
    await user.selectOptions(screen.getByLabelText('Motivo'), 'MAINTENANCE');
    await user.click(screen.getByRole('combobox', { name: 'Hora inicial' }));
    await user.click(screen.getByRole('option', { name: '09:00' }));
    await user.click(screen.getByRole('combobox', { name: 'Hora final' }));
    await user.click(screen.getByRole('option', { name: '12:00' }));
    await user.click(screen.getByRole('button', { name: 'Bloquear' }));

    expect(mutateAsync).toHaveBeenCalledWith({
      date: '2026-06-29',
      reason: 'MAINTENANCE',
      startTime: '09:00',
      endTime: '12:00',
    });
  }, 30_000);

  it('creates a special opening from the closed-day sheet', async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue({ id: 'opening-1' });
    scheduleHooks.useCreateOpening.mockReturnValue({ mutateAsync });

    renderWithIntl(
      <SchedulePage
        initialClosures={emptyClosures()}
        initialOpenings={emptyOpenings()}
        initialBookings={emptyBookings()}
        businessHours={makeBusinessHours(false)}
        todayKey="2026-06-29"
        weekStartKey="2026-06-29"
        slotGranularityMinutes={30}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Abrir dia especial' }));
    await user.click(screen.getByRole('combobox', { name: 'Hora inicial' }));
    await user.click(screen.getByRole('option', { name: '09:00' }));
    await user.click(screen.getByRole('combobox', { name: 'Hora final' }));
    await user.click(screen.getByRole('option', { name: '14:00' }));
    await user.click(screen.getByRole('button', { name: 'Abrir dia' }));

    expect(mutateAsync).toHaveBeenCalledWith({
      date: '2026-06-29',
      startTime: '09:00',
      endTime: '14:00',
    });
  }, 30_000);

  it('opens the removal dialog for a closure and confirms removal', async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue(undefined);
    scheduleHooks.useRemoveClosure.mockReturnValue({ mutateAsync });
    scheduleHooks.useScheduleClosures.mockReturnValue({
      data: closuresWith([
        {
          id: 'closure-1',
          date: '2026-06-29',
          startTime: '00:00',
          endTime: '05:00',
          reason: 'STAFF_DAY_OFF',
          notes: 'Manutenção preventiva',
        },
      ]),
    });

    renderWithIntl(
      <SchedulePage
        initialClosures={emptyClosures()}
        initialOpenings={emptyOpenings()}
        initialBookings={emptyBookings()}
        businessHours={makeBusinessHours(true)}
        todayKey="2026-06-29"
        weekStartKey="2026-06-29"
        initialSelectedDateKey="2026-06-29"
        slotGranularityMinutes={30}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Folga da equipe/i }));
    expect(screen.getByRole('button', { name: 'Remover bloqueio' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remover bloqueio' }));

    expect(mutateAsync).toHaveBeenCalledWith('closure-1');
  });

  it('opens the removal dialog for an opening and confirms removal', async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue(undefined);
    scheduleHooks.useRemoveOpening.mockReturnValue({ mutateAsync });
    scheduleHooks.useScheduleOpenings.mockReturnValue({
      data: openingsWith([
        {
          id: 'opening-1',
          date: '2026-06-29',
          startTime: '09:00',
          endTime: '14:00',
          notes: 'Horário especial',
        },
      ]),
    });

    renderWithIntl(
      <SchedulePage
        initialClosures={emptyClosures()}
        initialOpenings={emptyOpenings()}
        initialBookings={emptyBookings()}
        businessHours={makeBusinessHours(false)}
        todayKey="2026-06-29"
        weekStartKey="2026-06-29"
        initialSelectedDateKey="2026-06-29"
        slotGranularityMinutes={30}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Abertura especial/i }));
    expect(screen.getByRole('button', { name: 'Remover abertura' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remover abertura' }));

    expect(mutateAsync).toHaveBeenCalledWith('opening-1');
  });

  it('closes the status filter when escape is pressed', async () => {
    const user = userEvent.setup();

    renderWithIntl(
      <SchedulePage
        initialClosures={emptyClosures()}
        initialOpenings={emptyOpenings()}
        initialBookings={emptyBookings()}
        businessHours={makeBusinessHours(true)}
        todayKey="2026-06-29"
        weekStartKey="2026-06-29"
        slotGranularityMinutes={30}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Filtrar status' }));
    expect(screen.getByRole('checkbox', { name: 'Pendente' })).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('checkbox', { name: 'Pendente' })).not.toBeInTheDocument();
  });

  it('navigates weeks and resets the status filter', async () => {
    const user = userEvent.setup();

    scheduleHooks.useWeekBookings.mockReturnValue({
      data: {
        items: [
          makeBookingCard({
            bookingId: 'approved',
            contactName: 'Approved',
            status: 'APPROVED',
            scheduledAt: '2026-06-29T12:00:00.000Z',
          }),
          makeBookingCard({
            bookingId: 'pending',
            contactName: 'Pending',
            status: 'PENDING',
            scheduledAt: '2026-06-29T13:00:00.000Z',
          }),
        ],
        total: 2,
        page: 1,
        limit: 25,
      },
    });

    renderWithIntl(
      <SchedulePage
        initialClosures={emptyClosures()}
        initialOpenings={emptyOpenings()}
        initialBookings={emptyBookings()}
        businessHours={makeBusinessHours(true)}
        todayKey="2026-06-29"
        weekStartKey="2026-06-29"
        slotGranularityMinutes={30}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Próximo período' }));
    expect(screen.getByRole('heading', { name: /6 de julho/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Período anterior' }));
    expect(screen.getByRole('heading', { name: /29 de junho/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Filtrar status' }));
    await user.click(screen.getByRole('checkbox', { name: 'Pendente' }));
    expect(screen.getByRole('link', { name: 'Pending' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Padrão' }));
    expect(screen.queryByRole('link', { name: 'Pending' })).not.toBeInTheDocument();
  });

  it('keeps booking events on the tenant-local day when the UTC date differs', async () => {
    scheduleHooks.useWeekBookings.mockReturnValue({
      data: {
        items: [makeBookingCard()],
        total: 1,
        page: 1,
        limit: 25,
      },
    });

    renderWithIntl(
      <SchedulePage
        initialClosures={emptyClosures()}
        initialOpenings={emptyOpenings()}
        initialBookings={emptyBookings()}
        businessHours={makeBusinessHours(true)}
        todayKey="2026-06-29"
        weekStartKey="2026-06-29"
        slotGranularityMinutes={30}
      />,
    );

    expect(screen.getByRole('link', { name: 'Alice' })).toBeInTheDocument();
  });

  it('renders all non-pending booking statuses with their own palette', async () => {
    scheduleHooks.useWeekBookings.mockReturnValue({
      data: {
        items: [
          makeBookingCard({
            bookingId: 'approved',
            contactName: 'Approved',
            status: 'APPROVED',
            scheduledAt: '2026-06-29T12:00:00.000Z',
          }),
          makeBookingCard({
            bookingId: 'info-requested',
            contactName: 'Info requested',
            status: 'INFO_REQUESTED',
            scheduledAt: '2026-06-29T13:00:00.000Z',
          }),
          makeBookingCard({
            bookingId: 'rejected',
            contactName: 'Rejected',
            status: 'REJECTED',
            scheduledAt: '2026-06-29T14:00:00.000Z',
          }),
          makeBookingCard({
            bookingId: 'cancelled',
            contactName: 'Cancelled',
            status: 'CANCELLED',
            scheduledAt: '2026-06-29T15:00:00.000Z',
          }),
          makeBookingCard({
            bookingId: 'completed',
            contactName: 'Completed',
            status: 'COMPLETED',
            scheduledAt: '2026-06-29T16:00:00.000Z',
          }),
          makeBookingCard({
            bookingId: 'pending',
            contactName: 'Pending',
            status: 'PENDING',
            scheduledAt: '2026-06-29T17:00:00.000Z',
          }),
        ],
        total: 6,
        page: 1,
        limit: 25,
      },
    });

    renderWithIntl(
      <SchedulePage
        initialClosures={emptyClosures()}
        initialOpenings={emptyOpenings()}
        initialBookings={emptyBookings()}
        businessHours={makeBusinessHours(true)}
        todayKey="2026-06-29"
        weekStartKey="2026-06-29"
        slotGranularityMinutes={30}
      />,
    );

    expect(screen.queryByText('Pendente')).not.toBeInTheDocument();
    expect(screen.getByText('Aprovado')).toHaveClass(
      ...SCHEDULE_BOOKING_TIMELINE_CLASSES.APPROVED.split(' '),
    );
    expect(screen.getByText('Aguardando info')).toHaveClass(
      ...SCHEDULE_BOOKING_TIMELINE_CLASSES.INFO_REQUESTED.split(' '),
    );
    expect(screen.getByText('Rejeitado')).toHaveClass(
      ...SCHEDULE_BOOKING_TIMELINE_CLASSES.REJECTED.split(' '),
    );
    expect(screen.getByText('Cancelado')).toHaveClass(
      ...SCHEDULE_BOOKING_TIMELINE_CLASSES.CANCELLED.split(' '),
    );
    expect(screen.getByText('Concluído')).toHaveClass(
      ...SCHEDULE_BOOKING_TIMELINE_CLASSES.COMPLETED.split(' '),
    );
  });

  it('splits overlapping bookings into equal lanes', async () => {
    scheduleHooks.useWeekBookings.mockReturnValue({
      data: {
        items: [
          makeBookingCard({
            bookingId: 'first',
            contactName: 'First',
            status: 'APPROVED',
            scheduledAt: '2026-06-29T12:00:00.000Z',
          }),
          makeBookingCard({
            bookingId: 'second',
            contactName: 'Second',
            status: 'CANCELLED',
            scheduledAt: '2026-06-29T12:15:00.000Z',
          }),
        ],
        total: 2,
        page: 1,
        limit: 25,
      },
    });

    renderWithIntl(
      <SchedulePage
        initialClosures={emptyClosures()}
        initialOpenings={emptyOpenings()}
        initialBookings={emptyBookings()}
        businessHours={makeBusinessHours(true)}
        todayKey="2026-06-29"
        weekStartKey="2026-06-29"
        slotGranularityMinutes={30}
      />,
    );

    expect(screen.getByRole('link', { name: 'First' })).toHaveStyle({ width: '50%' });
    expect(screen.getByRole('link', { name: 'Second' })).toHaveStyle({ width: '50%' });
    expect(screen.getByRole('link', { name: 'First' })).toHaveStyle({ left: '0%' });
    expect(screen.getByRole('link', { name: 'Second' })).toHaveStyle({ left: '50%' });
  });
});
