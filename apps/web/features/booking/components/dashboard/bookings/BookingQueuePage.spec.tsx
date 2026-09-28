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
  mockUseActionNeeded.mockReturnValue({ data: emptyList() });
  mockUseToday.mockReturnValue({ data: emptyList() });
  mockUseUpcoming.mockReturnValue({ data: emptyList() });
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
