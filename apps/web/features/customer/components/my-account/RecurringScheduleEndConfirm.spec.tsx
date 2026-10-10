// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecurringBookingScheduleListItem } from '@ikaro/types';
import { ApiError } from '@/shared/lib/api/errors';
import {
  CustomerTopbarStatusProvider,
  useCustomerTopbarStatus,
} from '../customer-topbar-status-context';
import { RecurringScheduleEndConfirm } from './RecurringScheduleEndConfirm';

vi.mock('next-intl', () => ({
  useLocale: () => 'pt-BR',
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    const translations: Record<string, string> = {
      endConfirm: 'Encerrar recorrência',
      endKeep: 'Manter recorrência',
    };
    return translations[key] ?? (params ? `${key}:${JSON.stringify(params)}` : key);
  },
}));

vi.mock('@/shared/lib/formatting/use-formatting', () => ({
  useFormatting: () => ({
    formatDate: (date: Date) => date.toISOString().slice(0, 10),
  }),
}));

const pushMock = vi.fn();
const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

const endMock = vi.fn();
vi.mock('@/features/booking/api/recurring-booking-schedules', () => ({
  endRecurringScheduleAsCustomer: (...args: unknown[]) => endMock(...args),
}));

const schedule: RecurringBookingScheduleListItem = {
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

describe('RecurringScheduleEndConfirm', () => {
  beforeEach(() => {
    pushMock.mockReset();
    refreshMock.mockReset();
    endMock.mockReset();
  });

  it('summarises the schedule being ended', () => {
    render(<RecurringScheduleEndConfirm schedule={schedule} tenantSlug="lavacar" />);

    expect(screen.getByText('Sala Aurora')).toBeInTheDocument();
    expect(screen.getByText('endInfo')).toBeInTheDocument();
  });

  it('confirming ends the schedule and goes back to the list', async () => {
    endMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<RecurringScheduleEndConfirm schedule={schedule} tenantSlug="lavacar" />);

    await user.click(
      within(screen.getByTestId('action-pane-desktop')).getByRole('button', {
        name: 'Encerrar recorrência',
      }),
    );

    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith('/lavacar/my-account/recurring-schedules'),
    );
    expect(endMock).toHaveBeenCalledWith('sched-1');
    expect(refreshMock).toHaveBeenCalled();
  });

  it('shows the generic message and re-enables the button when the call fails with no code', async () => {
    endMock.mockRejectedValue(new Error('network error'));
    const user = userEvent.setup();
    render(<RecurringScheduleEndConfirm schedule={schedule} tenantSlug="lavacar" />);

    const pane = screen.getByTestId('action-pane-desktop');
    await user.click(within(pane).getByRole('button', { name: 'Encerrar recorrência' }));

    expect(await screen.findByTestId('end-schedule-error')).toHaveTextContent(
      'Algo deu errado. Tente novamente.',
    );
    expect(within(pane).getByRole('button', { name: 'Encerrar recorrência' })).not.toBeDisabled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('shows the translated message for a recognised problem code', async () => {
    endMock.mockRejectedValue(
      new ApiError(404, 'not found', { code: 'BOOKING_RECURRING_SCHEDULE_NOT_FOUND' }),
    );
    const user = userEvent.setup();
    render(<RecurringScheduleEndConfirm schedule={schedule} tenantSlug="lavacar" />);

    await user.click(
      within(screen.getByTestId('action-pane-desktop')).getByRole('button', {
        name: 'Encerrar recorrência',
      }),
    );

    expect(await screen.findByTestId('end-schedule-error')).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('"Manter recorrência" goes back to the schedule without calling the API', async () => {
    const user = userEvent.setup();
    render(<RecurringScheduleEndConfirm schedule={schedule} tenantSlug="lavacar" />);

    await user.click(
      within(screen.getByTestId('action-pane-desktop')).getByRole('button', {
        name: 'Manter recorrência',
      }),
    );

    expect(pushMock).toHaveBeenCalledWith('/lavacar/my-account/recurring-schedules/sched-1');
    expect(endMock).not.toHaveBeenCalled();
  });

  it('points the topbar back link at the schedule', () => {
    render(
      <CustomerTopbarStatusProvider>
        <TopbarProbe />
        <RecurringScheduleEndConfirm schedule={schedule} tenantSlug="lavacar" />
      </CustomerTopbarStatusProvider>,
    );

    expect(screen.getByTestId('probe-back-href')).toHaveTextContent(
      '/lavacar/my-account/recurring-schedules/sched-1',
    );
    expect(screen.getByTestId('probe-back-label')).toHaveTextContent('backToSchedule');
  });
});
