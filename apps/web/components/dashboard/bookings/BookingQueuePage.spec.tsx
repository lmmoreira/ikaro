// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { StaffBookingListResponse } from '@ikaro/types';
import { BookingQueuePage } from './BookingQueuePage';

const mockUseActionNeeded = vi.fn();
const mockUseToday = vi.fn();
const mockUseUpcoming = vi.fn();

vi.mock('@/lib/hooks/useBookings', () => ({
  useActionNeededBookings: (...args: unknown[]) => mockUseActionNeeded(...args),
  useTodayBookings: (...args: unknown[]) => mockUseToday(...args),
  useUpcomingBookings: (...args: unknown[]) => mockUseUpcoming(...args),
}));

vi.mock('@/components/dashboard/WeekNav', () => ({
  WeekNav: ({
    windowStart,
    onPrev,
    onNext,
  }: {
    windowStart: Date;
    onPrev: () => void;
    onNext: () => void;
  }) => (
    <div data-testid="week-nav" data-window-start={windowStart.toISOString()}>
      <button type="button" onClick={onPrev} aria-label="Período anterior" />
      <button type="button" onClick={onNext} aria-label="Próximo período" />
    </div>
  ),
}));

vi.mock('./BookingCard', () => ({
  BookingCard: ({
    booking,
    variant,
  }: {
    booking: { bookingId: string; contactName: string };
    variant: string;
  }) => (
    <div data-testid="booking-card" data-variant={variant} data-id={booking.bookingId}>
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
