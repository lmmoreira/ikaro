// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CustomerBookingListItem, RecurringBookingScheduleListItem } from '@ikaro/types';
import { CustomerTopbarStatusProvider } from '../customer-topbar-status-context';
import { RecurringScheduleDetail } from './RecurringScheduleDetail';

vi.mock('next-intl', () => ({
  useLocale: () => 'pt-BR',
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
}));

vi.mock('@/shared/lib/formatting/use-formatting', () => ({
  useFormatting: () => ({
    formatMoney: (amount: number) => `R$ ${amount.toFixed(2)}`,
    formatDate: (date: Date) => date.toISOString().slice(0, 10),
    formatTime: (date: Date) => date.toISOString().slice(11, 16),
    formatDateLong: (date: Date) => date.toISOString().slice(0, 10),
  }),
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: React.PropsWithChildren<{ href: string } & Record<string, unknown>>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function makeSchedule(
  overrides: Partial<RecurringBookingScheduleListItem> = {},
): RecurringBookingScheduleListItem {
  return {
    id: 'sched-1',
    customerId: 'c1',
    serviceId: 's1',
    serviceName: 'Sala Aurora',
    recurrence: {
      frequency: 'WEEKLY',
      daysOfWeek: ['tuesday'],
      startTime: '10:00',
      durationMinutes: 120,
    },
    startsOn: '2026-08-19',
    endsOn: '2026-11-11',
    status: 'ACTIVE',
    assignmentPolicy: 'FIXED_ASSIGNMENT',
    resourceIds: [],
    approvalHoldExpiresAt: null,
    ...overrides,
  };
}

function makeBooking(id: string, status: CustomerBookingListItem['status'] = 'APPROVED') {
  return {
    bookingId: id,
    status,
    scheduledAt: '2026-08-19T13:00:00.000Z',
    lines: [
      {
        lineId: `l-${id}`,
        serviceName: 'Sala Aurora',
        durationMinsAtBooking: 120,
        priceAtBooking: { amount: 100, currency: 'BRL' as const },
        actualPriceCharged: null,
      },
    ],
    totalPrice: { amount: 100, currency: 'BRL' as const },
    cancellableUntil: null,
  } satisfies CustomerBookingListItem;
}

function renderDetail(
  schedule: RecurringBookingScheduleListItem,
  occurrences: React.ComponentProps<typeof RecurringScheduleDetail>['occurrences'],
) {
  return render(
    <CustomerTopbarStatusProvider>
      <RecurringScheduleDetail schedule={schedule} tenantSlug="lavacar" occurrences={occurrences} />
    </CustomerTopbarStatusProvider>,
  );
}

const page = { items: [makeBooking('b1'), makeBooking('b2')], total: 13, page: 1, limit: 5 };

describe('RecurringScheduleDetail — ACTIVE', () => {
  it('shows the upcoming occurrences with skip and reschedule, and the end link', () => {
    renderDetail(makeSchedule(), page);

    expect(screen.getAllByTestId('recurring-occurrence')).toHaveLength(2);
    expect(screen.getAllByTestId('occurrence-skip')).toHaveLength(2);
    expect(screen.getAllByTestId('end-schedule-link')[0]).toHaveAttribute(
      'href',
      '/lavacar/my-account/recurring-schedules/sched-1/end',
    );
    expect(screen.getAllByTestId('recurring-schedule-status-badge')[0]).toHaveTextContent(
      'statusActive',
    );
  });

  it('shows the price and the upcoming count read from the loaded bookings', () => {
    renderDetail(makeSchedule(), page);

    // One in the "Dia e horário" row plus one per occurrence row.
    expect(screen.getAllByText(/perReservation.*R\$ 100\.00/)).toHaveLength(3);
    expect(screen.getByText('upcomingCount:{"count":13}')).toBeInTheDocument();
  });

  it('shows only the duration when no booking is loaded', () => {
    renderDetail(makeSchedule(), { items: [], total: 0, page: 1, limit: 5 });

    expect(screen.getByText(/durationOnly/)).toBeInTheDocument();
    expect(screen.queryByText(/perReservation/)).not.toBeInTheDocument();
  });

  it('offers no "Renovar" on a running schedule (it waits for the server flag)', () => {
    renderDetail(makeSchedule(), page);

    expect(screen.queryByTestId('renew-schedule-button')).not.toBeInTheDocument();
  });

  it('has no resource row (the schedule item carries none)', () => {
    renderDetail(makeSchedule(), page);

    expect(screen.queryByText(/Recurso|resource/i)).not.toBeInTheDocument();
  });
});

describe.each([
  ['ENDED', 'endedBanner'],
  ['CANCELLED', 'cancelledBanner'],
] as const)('RecurringScheduleDetail — %s (read-only)', (status, banner) => {
  const terminalPage = {
    items: [makeBooking('b1', 'COMPLETED'), makeBooking('b2', 'CANCELLED')],
    total: 2,
    page: 1,
    limit: 5,
  };

  it('shows its banner and the period’s bookings as history', () => {
    renderDetail(makeSchedule({ status }), terminalPage);

    expect(screen.getByText(new RegExp(banner))).toBeInTheDocument();
    expect(screen.getAllByTestId('recurring-occurrence')).toHaveLength(2);
  });

  it('offers no skip, reschedule or end (negative guarantee)', () => {
    renderDetail(makeSchedule({ status }), terminalPage);

    expect(screen.queryByTestId('occurrence-skip')).not.toBeInTheDocument();
    expect(screen.queryByTestId('occurrence-reschedule')).not.toBeInTheDocument();
    expect(screen.queryByTestId('end-schedule-link')).not.toBeInTheDocument();
  });

  it('has no new-reservation action (not part of the renewal story)', () => {
    renderDetail(makeSchedule({ status }), terminalPage);

    expect(
      screen.queryByRole('link', { name: /nova reserva|new reservation/i }),
    ).not.toBeInTheDocument();
  });

  it(
    status === 'ENDED'
      ? 'offers "Renovar", opening the creation form pre-filled from this schedule'
      : 'offers no "Renovar" — a cancelled schedule is not renewed',
    () => {
      renderDetail(makeSchedule({ id: 'sched-9', status }), terminalPage);

      if (status === 'ENDED') {
        expect(screen.getAllByTestId('renew-schedule-button')[0]).toHaveAttribute(
          'href',
          '/lavacar/my-account/recurring-schedules/new?renewFrom=sched-9',
        );
      } else {
        expect(screen.queryByTestId('renew-schedule-button')).not.toBeInTheDocument();
      }
    },
  );
});

describe('RecurringScheduleDetail — PENDING_APPROVAL', () => {
  it('renders the under-review view and reads no bookings', () => {
    renderDetail(
      makeSchedule({
        status: 'PENDING_APPROVAL',
        approvalHoldExpiresAt: '2026-08-18T09:30:00.000Z',
      }),
      null,
    );

    expect(screen.getByTestId('recurring-schedule-pending')).toBeInTheDocument();
    expect(screen.queryByTestId('recurring-occurrences')).not.toBeInTheDocument();
  });
});
