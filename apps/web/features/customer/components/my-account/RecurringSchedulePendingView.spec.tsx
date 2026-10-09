// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RecurringBookingScheduleListItem } from '@ikaro/types';
import {
  CustomerTopbarStatusProvider,
  useCustomerTopbarStatus,
} from '../customer-topbar-status-context';
import { RecurringSchedulePendingView } from './RecurringSchedulePendingView';

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

const schedule: RecurringBookingScheduleListItem = {
  id: 'sched-1',
  customerId: 'c1',
  serviceId: 's1',
  serviceName: 'Sala de reunião',
  recurrence: {
    frequency: 'WEEKLY',
    daysOfWeek: ['thursday'],
    startTime: '14:00',
    durationMinutes: 60,
  },
  startsOn: '2026-08-21',
  endsOn: '2026-11-13',
  status: 'PENDING_APPROVAL',
  assignmentPolicy: 'FIXED_ASSIGNMENT',
  approvalHoldExpiresAt: '2026-08-18T09:30:00.000Z',
};

function TopbarProbe(): React.JSX.Element {
  const status = useCustomerTopbarStatus();
  return (
    <div>
      <p data-testid="probe-back-href">{status?.backHrefOverride ?? 'none'}</p>
      <p data-testid="probe-back-label">{status?.backLabelOverride ?? 'none'}</p>
    </div>
  );
}

describe('RecurringSchedulePendingView', () => {
  it('says no booking exists yet and when the held slot expires', () => {
    render(<RecurringSchedulePendingView schedule={schedule} tenantSlug="lavacar" />);

    expect(screen.getByText('pendingHoldTitle')).toBeInTheDocument();
    expect(
      screen.getByText(/pendingHoldBody.*Sala de reunião.*holdUntil.*2026-08-18.*09:30/),
    ).toBeInTheDocument();
  });

  it('spells out the single decision for the whole series, over the requested period', () => {
    render(<RecurringSchedulePendingView schedule={schedule} tenantSlug="lavacar" />);

    expect(screen.getByText('pendingNext1')).toBeInTheDocument();
    expect(screen.getByText(/pendingNext2.*2026-08-21.*2026-11-13/)).toBeInTheDocument();
    expect(screen.getByText(/pendingNext3.*holdUntil/)).toBeInTheDocument();
  });

  it('links back to the schedule list from both action panes', () => {
    render(<RecurringSchedulePendingView schedule={schedule} tenantSlug="lavacar" />);

    for (const pane of ['action-pane-mobile', 'action-pane-desktop']) {
      expect(
        within(screen.getByTestId(pane)).getByRole('link', { name: 'viewMine' }),
      ).toHaveAttribute('href', '/lavacar/my-account/recurring-schedules');
    }
  });

  it('points the topbar back link at the list', () => {
    render(
      <CustomerTopbarStatusProvider>
        <TopbarProbe />
        <RecurringSchedulePendingView schedule={schedule} tenantSlug="lavacar" />
      </CustomerTopbarStatusProvider>,
    );

    expect(screen.getByTestId('probe-back-href')).toHaveTextContent(
      '/lavacar/my-account/recurring-schedules',
    );
    expect(screen.getByTestId('probe-back-label')).toHaveTextContent('backToList');
  });

  it('offers no end, skip or reschedule action while under review', () => {
    render(<RecurringSchedulePendingView schedule={schedule} tenantSlug="lavacar" />);

    expect(screen.queryByTestId('end-schedule-link')).not.toBeInTheDocument();
    expect(screen.queryByTestId('occurrence-skip')).not.toBeInTheDocument();
  });
});
