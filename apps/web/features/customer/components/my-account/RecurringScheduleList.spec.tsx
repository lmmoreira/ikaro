// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RecurringBookingScheduleListItem } from '@ikaro/types';
import { RecurringScheduleList } from './RecurringScheduleList';

vi.mock('next-intl', () => ({
  useLocale: () => 'pt-BR',
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
}));

vi.mock('@/shared/lib/formatting/use-formatting', () => ({
  useFormatting: () => ({
    formatDate: (date: Date) => date.toISOString().slice(0, 10),
    formatTime: (date: Date) => date.toISOString().slice(11, 16),
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
    approvalHoldExpiresAt: null,
    ...overrides,
  };
}

describe('RecurringScheduleList', () => {
  it('puts each status in its section with its badge', () => {
    render(
      <RecurringScheduleList
        tenantSlug="lavacar"
        schedules={[
          makeSchedule({ id: 'a', status: 'ACTIVE' }),
          makeSchedule({
            id: 'p',
            status: 'PENDING_APPROVAL',
            approvalHoldExpiresAt: '2026-08-18T09:30:00.000Z',
          }),
          makeSchedule({ id: 'e', status: 'ENDED' }),
          makeSchedule({ id: 'c', status: 'CANCELLED' }),
        ]}
      />,
    );

    const active = screen.getByTestId('section-active');
    const pending = screen.getByTestId('section-pending');
    const ended = screen.getByTestId('section-ended');

    expect(within(active).getByTestId('recurring-schedule-status-badge')).toHaveTextContent(
      'statusActive',
    );
    expect(within(pending).getByTestId('recurring-schedule-status-badge')).toHaveTextContent(
      'statusPending',
    );
    const endedBadges = within(ended)
      .getAllByTestId('recurring-schedule-status-badge')
      .map((badge) => badge.textContent);
    expect(endedBadges).toEqual(['statusEnded', 'statusCancelled']);
  });

  it('titles each row with the service name and links it to its detail page', () => {
    render(
      <RecurringScheduleList tenantSlug="lavacar" schedules={[makeSchedule({ id: 'abc' })]} />,
    );

    expect(screen.getByRole('link', { name: 'Sala Aurora' })).toHaveAttribute(
      'href',
      '/lavacar/my-account/recurring-schedules/abc',
    );
  });

  it('shows the recurrence and term, and the hold time on a pending row', () => {
    render(
      <RecurringScheduleList
        tenantSlug="lavacar"
        schedules={[
          makeSchedule({
            status: 'PENDING_APPROVAL',
            approvalHoldExpiresAt: '2026-08-18T09:30:00.000Z',
          }),
        ]}
      />,
    );

    expect(screen.getByText(/recurrenceLine/)).toBeInTheDocument();
    expect(screen.getByText(/holdNote.*holdUntil.*2026-08-18.*09:30/)).toBeInTheDocument();
  });

  it('gives an ended row its completion note and a cancelled row its neutral note', () => {
    render(
      <RecurringScheduleList
        tenantSlug="lavacar"
        schedules={[
          makeSchedule({ id: 'e', status: 'ENDED' }),
          makeSchedule({ id: 'c', status: 'CANCELLED' }),
        ]}
      />,
    );

    expect(screen.getByText(/endedNote/)).toBeInTheDocument();
    expect(screen.getByText('cancelledNote')).toBeInTheDocument();
  });

  it('renders no inline action on a row (renewal is a later story)', () => {
    render(
      <RecurringScheduleList
        tenantSlug="lavacar"
        schedules={[makeSchedule({ status: 'ACTIVE' }), makeSchedule({ id: 'e', status: 'ENDED' })]}
      />,
    );

    expect(screen.getAllByRole('link')).toHaveLength(2);
  });

  it('renders the empty state with its own call to action opening the creation form', () => {
    render(<RecurringScheduleList tenantSlug="lavacar" schedules={[]} />);

    expect(screen.getByTestId('recurring-schedules-empty')).toBeInTheDocument();
    expect(screen.getByText('emptyTitle')).toBeInTheDocument();
    expect(screen.getByTestId('recurring-schedules-empty-cta')).toHaveAttribute(
      'href',
      '/lavacar/my-account/recurring-schedules/new',
    );
  });

  it('puts the "+ Novo" menu in the page header on mobile only, and has no create button of its own', () => {
    render(<RecurringScheduleList tenantSlug="lavacar" schedules={[makeSchedule()]} />);

    // The desktop entry is the topbar menu: nothing else on the list creates a schedule.
    expect(screen.queryByTestId('recurring-schedules-empty-cta')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /createCta/ })).not.toBeInTheDocument();
    const menu = screen.getByTestId('mobile-new-menu');
    expect(menu.className).toContain('lg:hidden');
    fireEvent.click(within(menu).getByTestId('new-menu-trigger'));
    expect(screen.getByTestId('new-menu-recurring')).toHaveAttribute(
      'href',
      '/lavacar/my-account/recurring-schedules/new',
    );
  });

  it('hides a section that has no schedules', () => {
    render(
      <RecurringScheduleList
        tenantSlug="lavacar"
        schedules={[makeSchedule({ status: 'ACTIVE' })]}
      />,
    );

    expect(screen.queryByTestId('section-pending')).not.toBeInTheDocument();
    expect(screen.queryByTestId('section-ended')).not.toBeInTheDocument();
  });
});
