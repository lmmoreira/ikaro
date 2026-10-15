// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecurringBookingScheduleListItem, StaffBookingCardResponse } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { BookingQueueActionNeeded } from './BookingQueueActionNeeded';

vi.mock('./BookingCard', () => ({
  BookingCard: ({
    booking,
    onApprove,
  }: {
    booking: { bookingId: string; contactName: string };
    onApprove?: () => void;
  }) => (
    <div data-testid="booking-card" data-id={booking.bookingId}>
      {booking.contactName}
      <button type="button" onClick={onApprove}>
        Aprovar {booking.contactName}
      </button>
    </div>
  ),
}));

vi.mock('./RecurringScheduleCard', () => ({
  RecurringScheduleCard: ({ schedule }: { schedule: { id: string } }) => (
    <div data-testid="recurring-card" data-id={schedule.id} />
  ),
}));

function booking(id: string, name: string): StaffBookingCardResponse {
  return {
    bookingId: id,
    status: 'PENDING',
    scheduledAt: '2026-06-26T10:00:00.000Z',
    contactName: name,
    serviceNames: ['Lavagem'],
    totalPrice: { amount: 100, currency: 'BRL' },
    totalDurationMins: 60,
    isCustomer: true,
    assignedResources: [],
  } as StaffBookingCardResponse;
}

function recurrence(id: string): RecurringBookingScheduleListItem {
  return {
    id,
    customerId: 'cust-1',
    serviceId: 'svc-1',
    serviceName: 'Sala Aurora',
    recurrence: {
      frequency: 'WEEKLY',
      daysOfWeek: ['tuesday'],
      startTime: '10:00',
      durationMinutes: 120,
    },
    startsOn: '2026-07-07',
    endsOn: '2026-09-29',
    status: 'PENDING_APPROVAL',
    assignmentPolicy: 'FIXED_ASSIGNMENT',
    approvalHoldExpiresAt: '2026-06-26T12:00:00.000Z',
  };
}

function props(overrides: Partial<Parameters<typeof BookingQueueActionNeeded>[0]> = {}) {
  return {
    bookings: [],
    recurrences: [],
    showBookings: true,
    showRecurrences: true,
    recurrencesFailed: false,
    onRetryRecurrences: vi.fn(),
    onApprove: vi.fn(),
    isApproving: false,
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('BookingQueueActionNeeded', () => {
  it('shows the empty message when there is nothing to decide', () => {
    renderWithIntl(<BookingQueueActionNeeded {...props()} />);

    expect(screen.getByRole('heading', { name: 'Precisa de ação' })).toBeInTheDocument();
    expect(screen.getByText('Nenhum agendamento precisa de ação.')).toBeInTheDocument();
  });

  it('puts the recurrence cards first, then the bookings', () => {
    renderWithIntl(
      <BookingQueueActionNeeded
        {...props({
          bookings: [booking('b-1', 'Maria')],
          recurrences: [recurrence('r-1'), recurrence('r-2')],
        })}
      />,
    );

    const order = screen
      .getAllByTestId(/recurring-card|booking-card/)
      .map((el) => el.dataset['id']);
    expect(order).toEqual(['r-1', 'r-2', 'b-1']);
  });

  it('counts both kinds, and only the plain booking count when there is no recurrence', () => {
    const { rerender } = renderWithIntl(
      <BookingQueueActionNeeded
        {...props({
          bookings: [booking('b-1', 'Maria'), booking('b-2', 'João')],
          recurrences: [recurrence('r-1')],
        })}
      />,
    );
    expect(screen.getByText('2 agendamentos · 1 recorrência')).toBeInTheDocument();

    rerender(
      <BookingQueueActionNeeded
        {...props({ bookings: [booking('b-1', 'Maria'), booking('b-2', 'João')] })}
      />,
    );
    expect(screen.getByText('2 agendamentos')).toBeInTheDocument();
    expect(screen.queryByText(/recorrência/)).not.toBeInTheDocument();
  });

  it('leaves a hidden kind out of the cards and out of the count', () => {
    renderWithIntl(
      <BookingQueueActionNeeded
        {...props({
          bookings: [booking('b-1', 'Maria')],
          recurrences: [recurrence('r-1')],
          showRecurrences: false,
        })}
      />,
    );

    expect(screen.queryByTestId('recurring-card')).not.toBeInTheDocument();
    expect(screen.getByTestId('booking-card')).toBeInTheDocument();
    expect(screen.getByText('1 agendamento')).toBeInTheDocument();
  });

  it('renders no block at all when both kinds are hidden', () => {
    renderWithIntl(
      <BookingQueueActionNeeded
        {...props({
          bookings: [booking('b-1', 'Maria')],
          recurrences: [recurrence('r-1')],
          showBookings: false,
          showRecurrences: false,
        })}
      />,
    );

    expect(screen.queryByRole('heading', { name: 'Precisa de ação' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('booking-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('recurring-card')).not.toBeInTheDocument();
  });

  it('approves a booking from its card, and a recurrence card has no approve of its own', async () => {
    const onApprove = vi.fn();
    renderWithIntl(
      <BookingQueueActionNeeded
        {...props({
          bookings: [booking('b-1', 'Maria')],
          recurrences: [recurrence('r-1')],
          onApprove,
        })}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Aprovar Maria' }));

    expect(onApprove).toHaveBeenCalledWith('b-1');
    expect(screen.getAllByRole('button', { name: /Aprovar/ })).toHaveLength(1);
  });

  it('shows a retry when the pending requests could not be loaded', async () => {
    const onRetryRecurrences = vi.fn();
    renderWithIntl(
      <BookingQueueActionNeeded {...props({ recurrencesFailed: true, onRetryRecurrences })} />,
    );

    expect(screen.getByTestId('recurrences-load-error')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(onRetryRecurrences).toHaveBeenCalledTimes(1);
  });

  it('does not show the load error while recurrences are hidden by the filter', () => {
    renderWithIntl(
      <BookingQueueActionNeeded {...props({ recurrencesFailed: true, showRecurrences: false })} />,
    );

    expect(screen.queryByTestId('recurrences-load-error')).not.toBeInTheDocument();
  });
});
