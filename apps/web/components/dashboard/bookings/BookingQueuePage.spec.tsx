// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { StaffBookingListResponse } from '@ikaro/types';
import { BookingQueuePage } from './BookingQueuePage';

const mockUseActionNeeded = vi.fn();
const mockUseToday = vi.fn();
const mockUseUpcoming = vi.fn();
const approveBookingMutateAsync = vi.fn();

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
}));

vi.mock('@/lib/hooks/useBookings', () => ({
  useActionNeededBookings: (...args: unknown[]) => mockUseActionNeeded(...args),
  useTodayBookings: (...args: unknown[]) => mockUseToday(...args),
  useUpcomingBookings: (...args: unknown[]) => mockUseUpcoming(...args),
}));

vi.mock('@/lib/hooks/useBookingMutations', () => ({
  useApproveBooking: () => ({
    mutateAsync: approveBookingMutateAsync,
    isPending: false,
  }),
}));

vi.mock('@/components/dashboard/WeekNav', () => ({
  WeekNav: ({
    windowStart,
    onPrev,
    onNext,
    selectedDate,
    onSelectDate,
  }: {
    windowStart: Date;
    onPrev: () => void;
    onNext: () => void;
    selectedDate?: string | null;
    onSelectDate?: (dateKey: string) => void;
  }) => (
    <div
      data-testid="week-nav"
      data-window-start={windowStart.toISOString()}
      data-selected-date={selectedDate ?? ''}
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
    onApprove: _onApprove,
    isApproving: _isApproving,
  }: {
    booking: { bookingId: string; contactName: string };
    variant: string;
    emphasized?: boolean;
    onApprove?: () => void | Promise<void>;
    isApproving?: boolean;
  }) => (
    <div
      data-testid="booking-card"
      data-variant={variant}
      data-id={booking.bookingId}
      data-emphasized={emphasized ? 'true' : undefined}
    >
      {booking.contactName}
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

  it('updates windowStart when onPrev is clicked', async () => {
    render(<BookingQueuePage {...DEFAULT_PROPS} />);
    const before = screen.getByTestId('week-nav').dataset.windowStart;
    await userEvent.click(screen.getByRole('button', { name: 'Período anterior' }));
    const after = screen.getByTestId('week-nav').dataset.windowStart;
    expect(after).not.toBe(before);
  });

  it('updates windowStart when onNext is clicked', async () => {
    render(<BookingQueuePage {...DEFAULT_PROPS} />);
    const before = screen.getByTestId('week-nav').dataset.windowStart;
    await userEvent.click(screen.getByRole('button', { name: 'Próximo período' }));
    const after = screen.getByTestId('week-nav').dataset.windowStart;
    expect(after).not.toBe(before);
  });
});
