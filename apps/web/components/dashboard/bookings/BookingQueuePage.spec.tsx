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
  WeekNav: ({ startOfWeek, onPrev, onNext }: {
    startOfWeek: Date; onPrev: () => void; onNext: () => void;
  }) => (
    <div data-testid="week-nav" data-week={startOfWeek.toISOString()}>
      <button type="button" onClick={onPrev} aria-label="Semana anterior" />
      <button type="button" onClick={onNext} aria-label="Próxima semana" />
    </div>
  ),
}));

vi.mock('./BookingCard', () => ({
  BookingCard: ({ booking, variant }: { booking: { bookingId: string; contactName: string }; variant: string }) => (
    <div data-testid={`card-${variant}`} data-id={booking.bookingId}>{booking.contactName}</div>
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
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseActionNeeded.mockReturnValue({ data: emptyList() });
  mockUseToday.mockReturnValue({ data: emptyList() });
  mockUseUpcoming.mockReturnValue({ data: emptyList() });
});

describe('BookingQueuePage — section titles', () => {
  it('renders all three section headings', () => {
    render(<BookingQueuePage {...DEFAULT_PROPS} />);
    expect(screen.getByText('Precisa de ação')).toBeInTheDocument();
    expect(screen.getByText('Hoje')).toBeInTheDocument();
    expect(screen.getByText('Próximos dias')).toBeInTheDocument();
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
    expect(screen.getByText('Nenhum agendamento confirmado nos próximos dias.')).toBeInTheDocument();
  });
});

describe('BookingQueuePage — card rendering', () => {
  it('renders action-needed cards from hook data', () => {
    mockUseActionNeeded.mockReturnValue({ data: makeList(['Maria', 'João']) });
    render(<BookingQueuePage {...DEFAULT_PROPS} />);
    const cards = screen.getAllByTestId('card-action-needed');
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent('Maria');
    expect(cards[1]).toHaveTextContent('João');
  });

  it('renders today cards from hook data', () => {
    mockUseToday.mockReturnValue({ data: makeList(['Ana']) });
    render(<BookingQueuePage {...DEFAULT_PROPS} />);
    expect(screen.getByTestId('card-today')).toHaveTextContent('Ana');
  });

  it('renders upcoming cards from hook data', () => {
    mockUseUpcoming.mockReturnValue({ data: makeList(['Carlos']) });
    render(<BookingQueuePage {...DEFAULT_PROPS} />);
    expect(screen.getByTestId('card-upcoming')).toHaveTextContent('Carlos');
  });

  it('hides action-needed empty message when cards are present', () => {
    mockUseActionNeeded.mockReturnValue({ data: makeList(['Maria']) });
    render(<BookingQueuePage {...DEFAULT_PROPS} />);
    expect(screen.queryByText('Nenhum agendamento precisa de ação.')).not.toBeInTheDocument();
  });
});

describe('BookingQueuePage — initialData forwarding', () => {
  it('passes initialActionNeeded to hook', () => {
    const initial = makeList(['Pre-rendered']);
    render(<BookingQueuePage {...DEFAULT_PROPS} initialActionNeeded={initial} />);
    expect(mockUseActionNeeded).toHaveBeenCalledWith(initial);
  });

  it('passes initialToday to hook', () => {
    const initial = makeList(['Pre-rendered today']);
    render(<BookingQueuePage {...DEFAULT_PROPS} initialToday={initial} />);
    expect(mockUseToday).toHaveBeenCalledWith('2026-06-26', initial);
  });

  it('passes initialUpcoming to hook', () => {
    const initial = makeList(['Pre-rendered upcoming']);
    render(<BookingQueuePage {...DEFAULT_PROPS} initialUpcoming={initial} />);
    expect(mockUseUpcoming).toHaveBeenCalledWith('2026-06-27', initial);
  });
});

describe('BookingQueuePage — WeekNav', () => {
  it('renders WeekNav', () => {
    render(<BookingQueuePage {...DEFAULT_PROPS} />);
    expect(screen.getByTestId('week-nav')).toBeInTheDocument();
  });

  it('updates weekStart when onPrev is clicked', async () => {
    render(<BookingQueuePage {...DEFAULT_PROPS} />);
    const weekNavBefore = screen.getByTestId('week-nav').dataset.week;
    await userEvent.click(screen.getByRole('button', { name: 'Semana anterior' }));
    const weekNavAfter = screen.getByTestId('week-nav').dataset.week;
    expect(weekNavAfter).not.toBe(weekNavBefore);
  });

  it('updates weekStart when onNext is clicked', async () => {
    render(<BookingQueuePage {...DEFAULT_PROPS} />);
    const weekNavBefore = screen.getByTestId('week-nav').dataset.week;
    await userEvent.click(screen.getByRole('button', { name: 'Próxima semana' }));
    const weekNavAfter = screen.getByTestId('week-nav').dataset.week;
    expect(weekNavAfter).not.toBe(weekNavBefore);
  });
});
