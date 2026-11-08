// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecurringBookingScheduleListItem } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { RecurringScheduleCard } from './RecurringScheduleCard';

const mockUseStaffCustomer = vi.fn();
vi.mock('@/features/customer/hooks/useStaffCustomer', () => ({
  useStaffCustomer: (...args: unknown[]) => mockUseStaffCustomer(...args),
}));

function schedule(
  overrides: Partial<RecurringBookingScheduleListItem> = {},
): RecurringBookingScheduleListItem {
  return {
    id: 'sched-1',
    customerId: 'cust-1',
    serviceId: 'svc-1',
    serviceName: 'Sala Aurora',
    recurrence: {
      frequency: 'WEEKLY',
      daysOfWeek: ['tuesday'],
      startTime: '10:00',
      durationMinutes: 120,
    },
    startsOn: '2026-08-18',
    endsOn: '2026-11-10',
    status: 'PENDING_APPROVAL',
    assignmentPolicy: 'FIXED_ASSIGNMENT',
    approvalHoldExpiresAt: '2099-08-11T12:30:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseStaffCustomer.mockReturnValue({ data: { name: 'Ana Costa' } });
});

describe('RecurringScheduleCard', () => {
  it('names the customer, marks the card as a recurrence and states the pattern and term', () => {
    renderWithIntl(<RecurringScheduleCard schedule={schedule()} />);

    expect(screen.getByText('Ana Costa')).toBeInTheDocument();
    expect(screen.getByText('Recorrência')).toBeInTheDocument();
    expect(screen.getByText('Cliente')).toBeInTheDocument();
    expect(screen.getByText(/Sala Aurora · Toda terça · 10:00–12:00/)).toBeInTheDocument();
    // 18 Aug … 10 Nov 2026: 13 Tuesdays.
    expect(screen.getByText(/18\/08\/2026 → 10\/11\/2026 · 13 reservas/)).toBeInTheDocument();
  });

  it('says when the decision is due, in the tenant time zone', () => {
    renderWithIntl(<RecurringScheduleCard schedule={schedule()} />);

    expect(screen.getByText('Decidir até 09:30')).toBeInTheDocument();
  });

  it('says "Prazo encerrado" instead of a deadline once the hold has passed, and still leads to the screen', () => {
    renderWithIntl(
      <RecurringScheduleCard
        schedule={schedule({ approvalHoldExpiresAt: '2020-01-01T12:30:00.000Z' })}
      />,
    );

    expect(screen.getByTestId('recurring-card-deadline')).toHaveTextContent('Prazo encerrado');
    expect(screen.queryByText(/Decidir até/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver pedido' })).toBeInTheDocument();
  });

  it('omits the deadline line when the request has none', () => {
    renderWithIntl(<RecurringScheduleCard schedule={schedule({ approvalHoldExpiresAt: null })} />);

    expect(screen.queryByText(/Decidir até/)).not.toBeInTheDocument();
  });

  it('leads to the detail screen, and has no quick "Aprovar" (negative guarantee)', () => {
    renderWithIntl(<RecurringScheduleCard schedule={schedule()} />);

    expect(screen.getByRole('link', { name: 'Ver pedido' })).toHaveAttribute(
      'href',
      '/dashboard/bookings/recurring/sched-1',
    );
    expect(
      screen.getByRole('link', { name: 'Ver pedido de recorrência de Ana Costa' }),
    ).toHaveAttribute('href', '/dashboard/bookings/recurring/sched-1');
    expect(screen.queryByRole('button', { name: /Aprovar/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Aprovar/)).not.toBeInTheDocument();
  });

  it('asks for the customer of this schedule', () => {
    renderWithIntl(<RecurringScheduleCard schedule={schedule({ customerId: 'cust-9' })} />);

    expect(mockUseStaffCustomer).toHaveBeenCalledWith('cust-9');
  });

  it('falls back to a generic name while the customer loads or when the read failed', () => {
    mockUseStaffCustomer.mockReturnValue({ data: undefined });

    renderWithIntl(<RecurringScheduleCard schedule={schedule()} />);

    expect(
      screen.getByRole('link', { name: 'Ver pedido de recorrência de Cliente' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver pedido' })).toBeInTheDocument();
  });

  it('lists several weekdays in the pattern', () => {
    renderWithIntl(
      <RecurringScheduleCard
        schedule={schedule({
          recurrence: {
            frequency: 'WEEKLY',
            daysOfWeek: ['thursday', 'monday'],
            startTime: '09:00',
            durationMinutes: 60,
          },
        })}
      />,
    );

    expect(screen.getByText(/Toda semana: seg e qui · 09:00–10:00/)).toBeInTheDocument();
  });
});
