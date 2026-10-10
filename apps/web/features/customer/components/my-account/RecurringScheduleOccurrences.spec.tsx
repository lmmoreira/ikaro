// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CustomerBookingListItem } from '@ikaro/types';
import { RecurringScheduleOccurrences } from './RecurringScheduleOccurrences';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
}));

vi.mock('@/shared/lib/formatting/use-formatting', () => ({
  useFormatting: () => ({
    formatMoney: (amount: number) => `R$ ${amount.toFixed(2)}`,
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

function makeBooking(
  id: string,
  overrides: Partial<CustomerBookingListItem> = {},
): CustomerBookingListItem {
  return {
    bookingId: id,
    status: 'APPROVED',
    scheduledAt: '2026-08-19T13:00:00.000Z',
    lines: [
      {
        lineId: `l-${id}`,
        serviceName: 'Sala Aurora',
        durationMinsAtBooking: 120,
        priceAtBooking: { amount: 100, currency: 'BRL' },
        actualPriceCharged: null,
      },
    ],
    totalPrice: { amount: 100, currency: 'BRL' },
    cancellableUntil: null,
    ...overrides,
  };
}

const base = {
  tenantSlug: 'lavacar',
  scheduleId: 'sched-1',
  limit: 5,
} as const;

describe('RecurringScheduleOccurrences — upcoming', () => {
  it('links each occurrence’s skip and reschedule to its own booking, returning to this page', () => {
    render(
      <RecurringScheduleOccurrences
        {...base}
        mode="upcoming"
        bookings={[makeBooking('b1'), makeBooking('b2')]}
        page={2}
        total={12}
      />,
    );

    const rows = screen.getAllByTestId('recurring-occurrence');
    const returnTo = encodeURIComponent('/lavacar/my-account/recurring-schedules/sched-1?page=2');

    expect(within(rows[0]!).getByTestId('occurrence-skip')).toHaveAttribute(
      'href',
      `/lavacar/my-account/bookings/b1/cancel?returnTo=${returnTo}`,
    );
    expect(within(rows[0]!).getByTestId('occurrence-reschedule')).toHaveAttribute(
      'href',
      `/lavacar/my-account/bookings/b1/reschedule?returnTo=${returnTo}`,
    );
    expect(within(rows[1]!).getByTestId('occurrence-skip')).toHaveAttribute(
      'href',
      `/lavacar/my-account/bookings/b2/cancel?returnTo=${returnTo}`,
    );
  });

  it('returns to the bare schedule URL from page 1', () => {
    render(
      <RecurringScheduleOccurrences
        {...base}
        mode="upcoming"
        bookings={[makeBooking('b1')]}
        page={1}
        total={1}
      />,
    );

    expect(screen.getByTestId('occurrence-skip')).toHaveAttribute(
      'href',
      `/lavacar/my-account/bookings/b1/cancel?returnTo=${encodeURIComponent('/lavacar/my-account/recurring-schedules/sched-1')}`,
    );
  });

  it('shows the date, time, status and per-booking price', () => {
    render(
      <RecurringScheduleOccurrences
        {...base}
        mode="upcoming"
        bookings={[makeBooking('b1')]}
        page={1}
        total={1}
      />,
    );

    expect(screen.getByText('2026-08-19')).toBeInTheDocument();
    expect(screen.getByText(/13:00 · statusApproved/)).toBeInTheDocument();
    expect(screen.getByText(/perReservation.*R\$ 100\.00/)).toBeInTheDocument();
  });

  it('shows the empty note when there are no upcoming bookings', () => {
    render(
      <RecurringScheduleOccurrences {...base} mode="upcoming" bookings={[]} page={1} total={0} />,
    );

    expect(screen.getByText('noUpcoming')).toBeInTheDocument();
    expect(screen.queryByTestId('occurrence-skip')).not.toBeInTheDocument();
  });

  it('pages: a pager appears once the total passes one page and links the other pages', () => {
    render(
      <RecurringScheduleOccurrences
        {...base}
        mode="upcoming"
        bookings={[makeBooking('b1')]}
        page={2}
        total={13}
      />,
    );

    expect(screen.getByTestId('pager-previous')).toHaveAttribute(
      'href',
      '/lavacar/my-account/recurring-schedules/sched-1',
    );
    expect(screen.getByTestId('pager-next')).toHaveAttribute(
      'href',
      '/lavacar/my-account/recurring-schedules/sched-1?page=3',
    );
  });

  it('renders no pager for a single page', () => {
    render(
      <RecurringScheduleOccurrences
        {...base}
        mode="upcoming"
        bookings={[makeBooking('b1')]}
        page={1}
        total={5}
      />,
    );

    expect(screen.queryByTestId('occurrence-pager')).not.toBeInTheDocument();
  });
});

describe('RecurringScheduleOccurrences — history', () => {
  it('links each booking to its detail page and offers no skip or reschedule', () => {
    render(
      <RecurringScheduleOccurrences
        {...base}
        mode="history"
        bookings={[
          makeBooking('b1', { status: 'COMPLETED' }),
          makeBooking('b2', { status: 'CANCELLED' }),
        ]}
        page={1}
        total={2}
      />,
    );

    expect(screen.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '/lavacar/my-account/bookings/b1',
      '/lavacar/my-account/bookings/b2',
    ]);
    expect(screen.queryByTestId('occurrence-skip')).not.toBeInTheDocument();
    expect(screen.queryByTestId('occurrence-reschedule')).not.toBeInTheDocument();
    expect(screen.getByText(/statusCompleted/)).toBeInTheDocument();
    expect(screen.getByText(/statusCancelled/)).toBeInTheDocument();
  });

  it('shows the empty note when the period has no bookings', () => {
    render(
      <RecurringScheduleOccurrences {...base} mode="history" bookings={[]} page={1} total={0} />,
    );

    expect(screen.getByText('noPeriodBookings')).toBeInTheDocument();
  });
});
