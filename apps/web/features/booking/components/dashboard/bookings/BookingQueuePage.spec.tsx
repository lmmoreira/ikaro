// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StaffBookingListResponse } from '@ikaro/types';
import { BookingQueuePage } from './BookingQueuePage';
import { ApiError } from '@/shared/lib/api/errors';
import { FormattingContext } from '@/shared/lib/formatting/formatting-context';

const mockUseActionNeeded = vi.fn();
const mockUseToday = vi.fn();
const mockUseUpcoming = vi.fn();
const mockUsePendingRecurrences = vi.fn();
const refetchRecurrences = vi.fn();
const approveBookingMutateAsync = vi.fn().mockResolvedValue(undefined);
const routerPush = vi.fn();

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => {
    const translations: Record<string, Record<string, string>> = {
      'dashboard.bookingQueue': {
        actionNeededTitle: 'Precisa de ação',
        todayTitle: 'Hoje — confirmados',
        upcomingTitle: 'Próximos dias — confirmados',
        upcomingTitleFiltered: 'Próximos dias — {date}',
        bookingCount: '{count} agendamento(s)',
        emptyActionNeeded: 'Nenhum agendamento precisa de ação.',
        emptyToday: 'Nenhum agendamento confirmado para hoje.',
        emptyUpcomingFiltered: 'Nenhum agendamento confirmado para o dia selecionado.',
        emptyUpcoming: 'Nenhum agendamento confirmado nos próximos dias.',
        recurrenceCount: '{count} recorrência(s)',
        countJoin: '{bookings} · {recurrences}',
        recurrencesLoadError: 'Não foi possível carregar os pedidos de recorrência.',
        recurrencesRetry: 'Tentar de novo',
        filterTrigger: 'Filtrar agenda',
        filterMenuTitle: 'Mostrar na agenda',
        filterMenuDescription: 'Marque o que deve aparecer na lista.',
        filterGroupActionNeeded: 'Precisa de ação',
        filterGroupConfirmed: 'Confirmados',
        filterOptionBookings: 'Agendamentos',
        filterOptionRecurrences: 'Recorrências',
        filterOptionToday: 'Hoje',
        filterOptionUpcoming: 'Próximos dias',
        filterReset: 'Padrão',
        filterDone: 'Fechar',
        filterHiddenCount: '{count} ocultas',
        filterAllHidden: 'Tudo está oculto pelo filtro.',
        filterClear: 'Limpar filtro',
      },
    };
    return (key: string, params?: Record<string, unknown>) => {
      const ns = translations[namespace] ?? {};
      let value = ns[key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          value = value.replace(`{${k}}`, String(v));
        }
      }
      return value;
    };
  },
  useLocale: () => 'pt-BR',
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
}));

vi.mock('@/features/booking/hooks/useBookings', () => ({
  useActionNeededBookings: (...args: unknown[]) => mockUseActionNeeded(...args),
  useTodayBookings: (...args: unknown[]) => mockUseToday(...args),
  useUpcomingBookings: (...args: unknown[]) => mockUseUpcoming(...args),
}));

vi.mock('@/features/booking/hooks/useRecurringSchedules', () => ({
  usePendingRecurringSchedules: (...args: unknown[]) => mockUsePendingRecurrences(...args),
}));

vi.mock('@/providers/tenant-provider', () => ({
  useTenant: () => ({ tenantId: 't-1', tenantSlug: 'lavacar-bh' }),
}));

vi.mock('./RecurringScheduleCard', () => ({
  RecurringScheduleCard: ({ schedule }: { schedule: { id: string; serviceName: string } }) => (
    <div data-testid="recurring-card" data-id={schedule.id}>
      {schedule.serviceName}
    </div>
  ),
}));

vi.mock('@/features/booking/hooks/useBookingMutations', () => ({
  useApproveBooking: () => ({
    mutateAsync: approveBookingMutateAsync,
    isPending: false,
  }),
}));

// WeekNav renders its Date props in browser-local time, so the mock reads them back with the local
// getters: a local-midnight Date built by toLocalDate(key) must come back as exactly `key`,
// whatever the runner's TZ.
function localDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

vi.mock('@/shells/dashboard/components/WeekNav', () => ({
  WeekNav: ({
    windowStart,
    onPrev,
    onNext,
    selectedDate,
    onSelectDate,
    activeDates,
  }: {
    windowStart: Date;
    onPrev: () => void;
    onNext: () => void;
    selectedDate?: string | null;
    onSelectDate?: (dateKey: string) => void;
    activeDates?: ReadonlySet<string>;
  }) => (
    <div
      data-testid="week-nav"
      data-window-start={localDateKey(windowStart)}
      data-selected-date={selectedDate ?? ''}
      data-active-dates={[...(activeDates ?? [])].sort().join(',')}
    >
      <button type="button" onClick={onPrev} aria-label="Período anterior" />
      <button type="button" onClick={onNext} aria-label="Próximo período" />
      <button type="button" onClick={() => onSelectDate?.('2026-06-27')}>
        27
      </button>
    </div>
  ),
}));

vi.mock('./BookingCard', () => ({
  BookingCard: ({
    booking,
    variant,
    emphasized,
    onApprove,
  }: {
    booking: { bookingId: string; contactName: string };
    variant: string;
    emphasized?: boolean;
    onApprove?: () => void | Promise<void>;
  }) => (
    <div
      data-testid="booking-card"
      data-variant={variant}
      data-id={booking.bookingId}
      data-emphasized={emphasized ? 'true' : undefined}
    >
      {booking.contactName}
      {variant === 'action-needed' && onApprove ? (
        <button type="button" onClick={onApprove}>
          Aprovar
        </button>
      ) : null}
    </div>
  ),
}));

function emptyList(): StaffBookingListResponse {
  return { items: [], total: 0, page: 1, limit: 25 };
}

function makeList(names: string[]): StaffBookingListResponse {
  return {
    items: names.map((name, i) => ({
      hasOpenException: false,
      bookingId: `b-${i}`,
      status: 'PENDING' as const,
      scheduledAt: '2026-06-26T10:00:00.000Z',
      contactName: name,
      serviceNames: ['Lavagem'],
      totalPrice: { amount: 100, currency: 'BRL' },
      totalDurationMins: 60,
      isCustomer: true,
      assignedResources: [],
    })),
    total: names.length,
    page: 1,
    limit: 25,
  };
}

function makeUpcomingList(): StaffBookingListResponse {
  return {
    items: [
      {
        hasOpenException: false,
        bookingId: 'b-27',
        status: 'APPROVED' as const,
        scheduledAt: '2026-06-27T10:00:00.000Z',
        contactName: 'Carlos',
        serviceNames: ['Lavagem'],
        totalPrice: { amount: 100, currency: 'BRL' },
        totalDurationMins: 60,
        isCustomer: true,
        assignedResources: [],
      },
      {
        hasOpenException: false,
        bookingId: 'b-28',
        status: 'APPROVED' as const,
        scheduledAt: '2026-06-28T10:00:00.000Z',
        contactName: 'Beatriz',
        serviceNames: ['Lavagem'],
        totalPrice: { amount: 100, currency: 'BRL' },
        totalDurationMins: 60,
        isCustomer: true,
        assignedResources: [],
      },
    ],
    total: 2,
    page: 1,
    limit: 25,
  };
}

const DEFAULT_PROPS = {
  today: '2026-06-26',
  tomorrow: '2026-06-27',
  welcomeStaffScreenDays: 14,
};

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.window.localStorage.clear();
  mockUsePendingRecurrences.mockReturnValue({
    data: [],
    isError: false,
    refetch: refetchRecurrences,
  });
  mockUseActionNeeded.mockReturnValue({ data: emptyList() });
  mockUseToday.mockReturnValue({ data: emptyList() });
  mockUseUpcoming.mockReturnValue({ data: emptyList() });
});

describe('BookingQueuePage — "+ Novo" menu', () => {
  it('has exactly one create button above the queue', () => {
    render(<BookingQueuePage {...DEFAULT_PROPS} />);

    expect(screen.getAllByTestId('new-menu-trigger')).toHaveLength(1);
  });

  it('opens the menu with the Agendamento and Recorrência entries', async () => {
    render(<BookingQueuePage {...DEFAULT_PROPS} />);

    await userEvent.click(screen.getByTestId('new-menu-trigger'));

    const items = screen.getAllByTestId('new-menu-item');
    expect(items.map((item) => item.getAttribute('href'))).toEqual([
      '/dashboard/bookings/new?tipo=agendamento',
      '/dashboard/bookings/new?tipo=recorrencia',
    ]);
  });
});

describe('BookingQueuePage — section titles', () => {
  it('renders the action-needed section heading', () => {
    render(<BookingQueuePage {...DEFAULT_PROPS} />);
    expect(screen.getByText('Precisa de ação')).toBeInTheDocument();
  });

  it('renders today and upcoming sections when today is in the window', () => {
    render(<BookingQueuePage {...DEFAULT_PROPS} />);
    expect(screen.getByText('Hoje — confirmados')).toBeInTheDocument();
    expect(screen.getByText('Próximos dias — confirmados')).toBeInTheDocument();
  });
});

describe('BookingQueuePage — empty states', () => {
  it('shows pt-BR empty message for action-needed section', () => {
    render(<BookingQueuePage {...DEFAULT_PROPS} />);
    expect(screen.getByText('Nenhum agendamento precisa de ação.')).toBeInTheDocument();
  });

  it('shows pt-BR empty message for today section', () => {
    render(<BookingQueuePage {...DEFAULT_PROPS} />);
    expect(screen.getByText('Nenhum agendamento confirmado para hoje.')).toBeInTheDocument();
  });

  it('shows pt-BR empty message for upcoming section', () => {
    render(<BookingQueuePage {...DEFAULT_PROPS} />);
    expect(
      screen.getByText('Nenhum agendamento confirmado nos próximos dias.'),
    ).toBeInTheDocument();
  });
});

describe('BookingQueuePage — card rendering', () => {
  it('renders action-needed cards from hook data', () => {
    mockUseActionNeeded.mockReturnValue({ data: makeList(['Maria', 'João']) });
    render(<BookingQueuePage {...DEFAULT_PROPS} />);
    const cards = screen
      .getAllByTestId('booking-card')
      .filter((el) => el.dataset.variant === 'action-needed');
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent('Maria');
    expect(cards[1]).toHaveTextContent('João');
  });

  it('approves an action-needed booking from the queue card', async () => {
    mockUseActionNeeded.mockReturnValue({ data: makeList(['Maria']) });
    render(<BookingQueuePage {...DEFAULT_PROPS} />);

    await userEvent.click(screen.getByRole('button', { name: 'Aprovar' }));

    expect(approveBookingMutateAsync).toHaveBeenCalledWith({ id: 'b-0' });
  });

  it('routes to the booking detail page when the approval shortcut hits a slot conflict', async () => {
    approveBookingMutateAsync.mockRejectedValueOnce(new ApiError(409, 'slot unavailable'));
    mockUseActionNeeded.mockReturnValue({ data: makeList(['Maria']) });
    render(<BookingQueuePage {...DEFAULT_PROPS} />);

    await userEvent.click(screen.getByRole('button', { name: 'Aprovar' }));

    expect(routerPush).toHaveBeenCalledWith('/dashboard/bookings/b-0?conflict=1');
  });

  it('carries the refusal code to the detail page when the approval hits a closed time', async () => {
    approveBookingMutateAsync.mockRejectedValueOnce(
      new ApiError(409, 'closed', { code: 'BOOKING_SLOT_CLOSED' }),
    );
    mockUseActionNeeded.mockReturnValue({ data: makeList(['Maria']) });
    render(<BookingQueuePage {...DEFAULT_PROPS} />);

    await userEvent.click(screen.getByRole('button', { name: 'Aprovar' }));

    expect(routerPush).toHaveBeenCalledWith(
      '/dashboard/bookings/b-0?conflict=1&reason=BOOKING_SLOT_CLOSED',
    );
  });

  it('shows an inline error banner for a non-conflict approval failure instead of failing silently', async () => {
    approveBookingMutateAsync.mockRejectedValueOnce(
      new ApiError(400, 'Cannot transition', { code: 'BOOKING_INVALID_TRANSITION' }),
    );
    mockUseActionNeeded.mockReturnValue({ data: makeList(['Maria']) });
    render(<BookingQueuePage {...DEFAULT_PROPS} />);

    await userEvent.click(screen.getByRole('button', { name: 'Aprovar' }));

    expect(
      await screen.findByText(
        'Não é possível alterar o status do agendamento para o status solicitado.',
      ),
    ).toBeInTheDocument();
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('renders today cards from hook data', () => {
    mockUseToday.mockReturnValue({ data: makeList(['Ana']) });
    render(<BookingQueuePage {...DEFAULT_PROPS} />);
    const card = screen.getAllByTestId('booking-card').find((el) => el.dataset.variant === 'today');
    expect(card).toHaveTextContent('Ana');
  });

  it('renders upcoming cards from hook data', () => {
    mockUseUpcoming.mockReturnValue({ data: makeList(['Carlos']) });
    render(<BookingQueuePage {...DEFAULT_PROPS} />);
    const card = screen
      .getAllByTestId('booking-card')
      .find((el) => el.dataset.variant === 'upcoming');
    expect(card).toHaveTextContent('Carlos');
  });

  it('filters upcoming cards when a week day is selected, then restores them on second click', async () => {
    mockUseUpcoming.mockReturnValue({ data: makeUpcomingList() });
    render(<BookingQueuePage {...DEFAULT_PROPS} />);

    expect(screen.getByText('Carlos')).toBeInTheDocument();
    expect(screen.getByText('Beatriz')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '27' }));

    expect(screen.getByTestId('week-nav')).toHaveAttribute('data-selected-date', '2026-06-27');
    expect(screen.getByText('Próximos dias — 27/06')).toBeInTheDocument();
    expect(screen.getByText('Carlos')).toBeInTheDocument();
    expect(screen.queryByText('Beatriz')).not.toBeInTheDocument();
    expect(screen.getByText('Carlos')).toHaveAttribute('data-emphasized', 'true');

    await userEvent.click(screen.getByRole('button', { name: '27' }));

    expect(screen.getByTestId('week-nav')).toHaveAttribute('data-selected-date', '');
    expect(screen.getByText('Carlos')).toBeInTheDocument();
    expect(screen.getByText('Beatriz')).toBeInTheDocument();
    expect(screen.getByText('Carlos')).not.toHaveAttribute('data-emphasized');
  });

  it('hides action-needed empty message when cards are present', () => {
    mockUseActionNeeded.mockReturnValue({ data: makeList(['Maria']) });
    render(<BookingQueuePage {...DEFAULT_PROPS} />);
    expect(screen.queryByText('Nenhum agendamento precisa de ação.')).not.toBeInTheDocument();
  });
});

function makeRecurrence(id: string, serviceName: string, holdExpiresAt: string | null) {
  return {
    id,
    customerId: `cust-${id}`,
    serviceId: 'svc-1',
    serviceName,
    recurrence: {
      frequency: 'WEEKLY' as const,
      daysOfWeek: ['tuesday' as const],
      startTime: '10:00',
      durationMinutes: 120,
    },
    startsOn: '2026-07-07',
    endsOn: '2026-09-29',
    status: 'PENDING_APPROVAL' as const,
    assignmentPolicy: 'FIXED_ASSIGNMENT' as const,
    approvalHoldExpiresAt: holdExpiresAt,
  };
}

function withRecurrences(items: ReturnType<typeof makeRecurrence>[]) {
  mockUsePendingRecurrences.mockReturnValue({
    data: items,
    isError: false,
    refetch: refetchRecurrences,
  });
}

describe('BookingQueuePage — recurrence requests in "Precisa de ação"', () => {
  it('renders no recurrence card and keeps the plain booking count when there are none (regression pin)', () => {
    mockUseActionNeeded.mockReturnValue({ data: makeList(['Maria', 'João']) });

    render(<BookingQueuePage {...DEFAULT_PROPS} />);

    expect(screen.queryByTestId('recurring-card')).not.toBeInTheDocument();
    expect(screen.getByText('2 agendamento(s)')).toBeInTheDocument();
    expect(screen.queryByText(/recorrência/)).not.toBeInTheDocument();
    expect(screen.getAllByTestId('booking-card')).toHaveLength(2);
  });

  it('pins the recurrence cards above the bookings, closest decision deadline first', () => {
    mockUseActionNeeded.mockReturnValue({ data: makeList(['Maria']) });
    withRecurrences([
      makeRecurrence('later', 'Sala B', '2026-06-26T13:00:00.000Z'),
      makeRecurrence('sooner', 'Sala A', '2026-06-26T12:00:00.000Z'),
    ]);

    render(<BookingQueuePage {...DEFAULT_PROPS} />);

    const order = screen
      .getAllByTestId(/recurring-card|booking-card/)
      .map((el) => el.dataset['id']);
    expect(order).toEqual(['sooner', 'later', 'b-0']);
  });

  it('counts both kinds in the block header', () => {
    mockUseActionNeeded.mockReturnValue({ data: makeList(['Maria', 'João']) });
    withRecurrences([makeRecurrence('r-1', 'Sala A', '2026-06-26T12:00:00.000Z')]);

    render(<BookingQueuePage {...DEFAULT_PROPS} />);

    expect(screen.getByText('2 agendamento(s) · 1 recorrência(s)')).toBeInTheDocument();
  });

  it('counts only recurrences when there is no booking to act on', () => {
    withRecurrences([makeRecurrence('r-1', 'Sala A', '2026-06-26T12:00:00.000Z')]);

    render(<BookingQueuePage {...DEFAULT_PROPS} />);

    expect(screen.getByText('1 recorrência(s)')).toBeInTheDocument();
    expect(screen.queryByText('Nenhum agendamento precisa de ação.')).not.toBeInTheDocument();
  });

  it('shows the requests whichever week the strip is on', async () => {
    withRecurrences([makeRecurrence('r-1', 'Sala A', '2026-06-26T12:00:00.000Z')]);
    render(<BookingQueuePage {...DEFAULT_PROPS} />);

    await userEvent.click(screen.getByRole('button', { name: 'Próximo período' }));

    expect(screen.getByTestId('recurring-card')).toBeInTheDocument();
  });

  it('offers a retry when the pending requests could not be loaded', async () => {
    mockUsePendingRecurrences.mockReturnValue({
      data: undefined,
      isError: true,
      refetch: refetchRecurrences,
    });

    render(<BookingQueuePage {...DEFAULT_PROPS} />);

    expect(screen.getByTestId('recurrences-load-error')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(refetchRecurrences).toHaveBeenCalledTimes(1);
  });
});

describe('BookingQueuePage — "Filtrar agenda" balloon', () => {
  async function openBalloon() {
    await userEvent.click(screen.getByRole('button', { name: 'Filtrar agenda' }));
  }

  it('starts with every block visible and no hidden-count badge', () => {
    mockUseActionNeeded.mockReturnValue({ data: makeList(['Maria']) });
    withRecurrences([makeRecurrence('r-1', 'Sala A', '2026-06-26T12:00:00.000Z')]);

    render(<BookingQueuePage {...DEFAULT_PROPS} />);

    expect(screen.getByTestId('recurring-card')).toBeInTheDocument();
    expect(screen.getAllByTestId('booking-card')).toHaveLength(1);
    expect(screen.getByText('Hoje — confirmados')).toBeInTheDocument();
    expect(screen.getByText('Próximos dias — confirmados')).toBeInTheDocument();
    expect(screen.queryByTestId('floating-filter-hidden-count')).not.toBeInTheDocument();
  });

  it('hides the recurrences and keeps the bookings, and counts what is hidden', async () => {
    mockUseActionNeeded.mockReturnValue({ data: makeList(['Maria']) });
    withRecurrences([makeRecurrence('r-1', 'Sala A', '2026-06-26T12:00:00.000Z')]);
    render(<BookingQueuePage {...DEFAULT_PROPS} />);

    await openBalloon();
    await userEvent.click(screen.getByRole('checkbox', { name: /Recorrências/ }));

    expect(screen.queryByTestId('recurring-card')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('booking-card')).toHaveLength(1);
    expect(screen.getByText('1 agendamento(s)')).toBeInTheDocument();
    expect(screen.getByTestId('floating-filter-hidden-count')).toHaveTextContent('1');
  });

  it('hides the bookings and keeps the recurrences', async () => {
    mockUseActionNeeded.mockReturnValue({ data: makeList(['Maria']) });
    withRecurrences([makeRecurrence('r-1', 'Sala A', '2026-06-26T12:00:00.000Z')]);
    render(<BookingQueuePage {...DEFAULT_PROPS} />);

    await openBalloon();
    await userEvent.click(screen.getByRole('checkbox', { name: /Agendamentos/ }));

    expect(screen.getByTestId('recurring-card')).toBeInTheDocument();
    expect(screen.queryByTestId('booking-card')).not.toBeInTheDocument();
  });

  it('hides "Hoje" and "Próximos dias" independently of the action-needed block', async () => {
    render(<BookingQueuePage {...DEFAULT_PROPS} />);

    await openBalloon();
    await userEvent.click(screen.getByRole('checkbox', { name: /Hoje/ }));
    expect(screen.queryByText('Hoje — confirmados')).not.toBeInTheDocument();
    expect(screen.getByText('Próximos dias — confirmados')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('checkbox', { name: /Próximos dias/ }));
    expect(screen.queryByText('Próximos dias — confirmados')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Precisa de ação' })).toBeInTheDocument();
  });

  it('drops the whole "Precisa de ação" block when both of its kinds are hidden', async () => {
    render(<BookingQueuePage {...DEFAULT_PROPS} />);

    await openBalloon();
    await userEvent.click(screen.getByRole('checkbox', { name: /Agendamentos/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Recorrências/ }));

    expect(screen.queryByText('Nenhum agendamento precisa de ação.')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Precisa de ação' })).not.toBeInTheDocument();
    expect(screen.getByText('Hoje — confirmados')).toBeInTheDocument();
  });

  it('shows the empty state with "Limpar filtro" when everything is hidden, and restores it', async () => {
    render(<BookingQueuePage {...DEFAULT_PROPS} />);

    await openBalloon();
    for (const name of [/Agendamentos/, /Recorrências/, /Hoje/, /Próximos dias/]) {
      await userEvent.click(screen.getByRole('checkbox', { name }));
    }
    expect(screen.getByTestId('agenda-all-hidden')).toBeInTheDocument();
    expect(screen.getByText('Tudo está oculto pelo filtro.')).toBeInTheDocument();
    expect(screen.queryByText('Hoje — confirmados')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Limpar filtro' }));

    expect(screen.queryByTestId('agenda-all-hidden')).not.toBeInTheDocument();
    expect(screen.getByText('Hoje — confirmados')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Precisa de ação' })).toBeInTheDocument();
  });

  it('"Padrão" shows every block again', async () => {
    render(<BookingQueuePage {...DEFAULT_PROPS} />);
    await openBalloon();
    await userEvent.click(screen.getByRole('checkbox', { name: /Hoje/ }));
    expect(screen.queryByText('Hoje — confirmados')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Padrão' }));

    expect(screen.getByText('Hoje — confirmados')).toBeInTheDocument();
  });

  it('remembers the choice after a remount (persisted per tenant)', async () => {
    const first = render(<BookingQueuePage {...DEFAULT_PROPS} />);
    await openBalloon();
    await userEvent.click(screen.getByRole('checkbox', { name: /Próximos dias/ }));
    first.unmount();

    render(<BookingQueuePage {...DEFAULT_PROPS} />);

    expect(screen.queryByText('Próximos dias — confirmados')).not.toBeInTheDocument();
    expect(screen.getByText('Hoje — confirmados')).toBeInTheDocument();
  });

  it('feeds each option its own count', async () => {
    mockUseActionNeeded.mockReturnValue({ data: makeList(['Maria', 'João', 'Ana']) });
    mockUseToday.mockReturnValue({ data: makeList(['Paulo']) });
    mockUseUpcoming.mockReturnValue({ data: makeUpcomingList() });
    withRecurrences([makeRecurrence('r-1', 'Sala A', '2026-06-26T12:00:00.000Z')]);
    render(<BookingQueuePage {...DEFAULT_PROPS} />);

    await openBalloon();

    const rowOf = (name: RegExp) => screen.getByRole('checkbox', { name }).closest('label');
    expect(rowOf(/Agendamentos/)).toHaveTextContent('3');
    expect(rowOf(/Recorrências/)).toHaveTextContent('1');
    expect(rowOf(/Hoje/)).toHaveTextContent('1');
    expect(rowOf(/Próximos dias/)).toHaveTextContent('2');
  });

  it('keeps the picked day while "Próximos dias" is hidden, so it applies again when shown', async () => {
    mockUseUpcoming.mockReturnValue({ data: makeUpcomingList() });
    render(<BookingQueuePage {...DEFAULT_PROPS} />);
    await userEvent.click(screen.getByRole('button', { name: '27' }));
    expect(screen.getByTestId('week-nav')).toHaveAttribute('data-selected-date', '2026-06-27');

    await openBalloon();
    await userEvent.click(screen.getByRole('checkbox', { name: /Próximos dias/ }));
    // Hidden block: nothing to act on, and the pick is neither cleared nor moved.
    expect(screen.queryByText(/Próximos dias — /)).not.toBeInTheDocument();
    expect(screen.getByTestId('week-nav')).toHaveAttribute('data-selected-date', '2026-06-27');

    await userEvent.click(screen.getByRole('checkbox', { name: /Próximos dias/ }));
    expect(screen.getByText('Próximos dias — 27/06')).toBeInTheDocument();
  });
});

describe('BookingQueuePage — WeekNav', () => {
  it('renders WeekNav', () => {
    render(<BookingQueuePage {...DEFAULT_PROPS} />);
    expect(screen.getByTestId('week-nav')).toBeInTheDocument();
  });

  it('starts the window on the tenant-local today it was given', () => {
    render(<BookingQueuePage {...DEFAULT_PROPS} />);
    expect(screen.getByTestId('week-nav')).toHaveAttribute('data-window-start', '2026-06-26');
  });

  it('moves the window back by a whole window when onPrev is clicked', async () => {
    render(<BookingQueuePage {...DEFAULT_PROPS} />);
    await userEvent.click(screen.getByRole('button', { name: 'Período anterior' }));
    expect(screen.getByTestId('week-nav')).toHaveAttribute('data-window-start', '2026-06-12');
  });

  it('moves the window forward by a whole window across a month boundary when onNext is clicked', async () => {
    render(<BookingQueuePage {...DEFAULT_PROPS} />);
    await userEvent.click(screen.getByRole('button', { name: 'Próximo período' }));
    expect(screen.getByTestId('week-nav')).toHaveAttribute('data-window-start', '2026-07-10');
  });

  it('hides the today section and starts upcoming at the window start once today leaves the window', async () => {
    render(<BookingQueuePage {...DEFAULT_PROPS} />);
    await userEvent.click(screen.getByRole('button', { name: 'Próximo período' }));

    expect(screen.queryByText('Hoje — confirmados')).not.toBeInTheDocument();
    expect(mockUseUpcoming).toHaveBeenLastCalledWith('2026-07-10', '2026-07-23', undefined, true);
  });

  it('keeps upcoming hidden and disabled when tomorrow falls past the window end', () => {
    render(
      <BookingQueuePage today="2026-06-26" tomorrow="2026-06-27" welcomeStaffScreenDays={1} />,
    );

    expect(screen.queryByText('Próximos dias — confirmados')).not.toBeInTheDocument();
    expect(mockUseUpcoming).toHaveBeenLastCalledWith('2026-06-27', '2026-06-26', undefined, false);
  });
});

// The window keys the queue sends to the server must not depend on the browser's timezone.
// The old code built a browser-local midnight and read it back as a UTC date, which moved the
// keys a day back for a browser at a positive UTC offset (Auckland, UTC+12 in June).
describe('BookingQueuePage — window keys are independent of the runner timezone', () => {
  const originalTZ = process.env.TZ;

  afterEach(() => {
    if (originalTZ === undefined) delete process.env.TZ;
    else process.env.TZ = originalTZ;
  });

  it.each([
    { tz: 'Pacific/Auckland', juneOffsetMinutes: -720 },
    { tz: 'America/Sao_Paulo', juneOffsetMinutes: 180 },
    { tz: 'UTC', juneOffsetMinutes: 0 },
  ])('sends the same tenant-local keys under TZ=$tz', async ({ tz, juneOffsetMinutes }) => {
    process.env.TZ = tz;
    // Guard against a vacuous pass: the TZ switch must really have taken effect.
    expect(new Date('2026-06-26T00:00:00').getTimezoneOffset()).toBe(juneOffsetMinutes);

    render(<BookingQueuePage {...DEFAULT_PROPS} />);

    expect(mockUseActionNeeded).toHaveBeenLastCalledWith('2026-06-26', '2026-07-09', undefined);
    expect(mockUseUpcoming).toHaveBeenLastCalledWith('2026-06-27', '2026-07-09', undefined, true);
    expect(screen.getByTestId('week-nav')).toHaveAttribute('data-window-start', '2026-06-26');

    await userEvent.click(screen.getByRole('button', { name: 'Próximo período' }));

    expect(mockUseActionNeeded).toHaveBeenLastCalledWith('2026-07-10', '2026-07-23', undefined);
    expect(screen.getByTestId('week-nav')).toHaveAttribute('data-window-start', '2026-07-10');
  });
});

describe('BookingQueuePage — bookings are bucketed by the tenant-local day', () => {
  function makeBooking(bookingId: string, name: string, scheduledAt: string) {
    return {
      bookingId,
      status: 'APPROVED' as const,
      scheduledAt,
      contactName: name,
      serviceNames: ['Lavagem'],
      totalPrice: { amount: 100, currency: 'BRL' },
      totalDurationMins: 60,
      isCustomer: true,
      assignedResources: [],
    };
  }

  function renderInTimezone(timezone: string) {
    return render(
      <FormattingContext.Provider
        value={{
          locale: 'pt-BR',
          currency: 'BRL',
          timezone,
          dateFormat: 'DD/MM/YYYY',
          timeFormat: '24h',
        }}
      >
        <BookingQueuePage {...DEFAULT_PROPS} />
      </FormattingContext.Provider>,
    );
  }

  it('puts a 22:00-local booking (next UTC day) on its own local day for a UTC-3 tenant', () => {
    mockUseUpcoming.mockReturnValue({
      data: {
        items: [
          // 2026-06-28T01:00Z is Saturday 2026-06-27 22:00 in São Paulo.
          makeBooking('b-late', 'Tarde', '2026-06-28T01:00:00.000Z'),
          makeBooking('b-noon', 'Meio-dia', '2026-06-28T15:00:00.000Z'),
        ],
        total: 2,
        page: 1,
        limit: 25,
      },
    });

    renderInTimezone('America/Sao_Paulo');

    expect(screen.getByTestId('week-nav')).toHaveAttribute(
      'data-active-dates',
      '2026-06-27,2026-06-28',
    );
  });

  it('keeps the 22:00-local booking under its local day chip and out of the next one', async () => {
    mockUseUpcoming.mockReturnValue({
      data: {
        items: [
          makeBooking('b-late', 'Tarde', '2026-06-28T01:00:00.000Z'),
          makeBooking('b-noon', 'Meio-dia', '2026-06-28T15:00:00.000Z'),
        ],
        total: 2,
        page: 1,
        limit: 25,
      },
    });

    renderInTimezone('America/Sao_Paulo');
    // The WeekNav mock's chip selects 2026-06-27.
    await userEvent.click(screen.getByRole('button', { name: '27' }));

    expect(screen.getByText('Tarde')).toBeInTheDocument();
    expect(screen.queryByText('Meio-dia')).not.toBeInTheDocument();
  });

  it('puts an early-morning-local booking (previous UTC day) on its own local day for a UTC+ tenant', () => {
    mockUseUpcoming.mockReturnValue({
      data: {
        // 2026-06-26T13:00Z is Saturday 2026-06-27 01:00 in Auckland (UTC+12).
        items: [makeBooking('b-early', 'Cedo', '2026-06-26T13:00:00.000Z')],
        total: 1,
        page: 1,
        limit: 25,
      },
    });

    renderInTimezone('Pacific/Auckland');

    expect(screen.getByTestId('week-nav')).toHaveAttribute('data-active-dates', '2026-06-27');
  });
});
