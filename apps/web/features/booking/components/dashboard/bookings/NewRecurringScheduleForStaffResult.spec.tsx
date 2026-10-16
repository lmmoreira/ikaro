// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CreateRecurringBookingScheduleResponse } from '@ikaro/types';
import { makeHotsiteService, renderWithIntl } from '@/test-utils';
import {
  NewRecurringScheduleForStaffResult,
  type StaffScheduleCustomer,
} from './NewRecurringScheduleForStaffResult';

type Outcome = React.ComponentProps<typeof NewRecurringScheduleForStaffResult>['outcome'];

const CUSTOMER: StaffScheduleCustomer = {
  customerId: 'cust-1',
  name: 'Ana Costa',
  email: 'ana@email.com',
};
const DRAFT = {
  serviceId: 'svc-1',
  resourceIds: [],
  daysOfWeek: ['monday'],
  startTime: '09:00',
  startsOn: '2026-10-12',
  endsOn: '2026-10-26',
} as const;

function renderResult(outcome: Outcome, onChangePattern = vi.fn()) {
  renderWithIntl(
    <NewRecurringScheduleForStaffResult
      outcome={outcome}
      customer={CUSTOMER}
      service={makeHotsiteService({ name: 'Sala Aurora', durationMinutes: 120 })}
      draft={DRAFT}
      resourceOptions={undefined}
      onChangePattern={onChangePattern}
    />,
  );
  return onChangePattern;
}

// The layout renders the action pane twice (mobile and desktop); assert on one.
function pane() {
  return within(screen.getByTestId('action-pane-desktop'));
}

describe('NewRecurringScheduleForStaffResult', () => {
  it('shows the created panel with the occurrence count, and offers the Agenda and another recurrence', () => {
    renderResult({
      kind: 'ACTIVE',
      schedule: { id: 'sch-1', status: 'ACTIVE' } as CreateRecurringBookingScheduleResponse,
    });

    const panel = screen.getByTestId('staff-schedule-outcome');
    expect(panel).toHaveAttribute('data-outcome', 'ACTIVE');
    expect(panel).toHaveAttribute('role', 'status');
    expect(panel).toHaveTextContent('Recorrência criada para Ana Costa');
    expect(panel).toHaveTextContent('Criamos as 3 reservas');
    expect(pane().getByTestId('staff-schedule-back-to-agenda')).toHaveAttribute(
      'href',
      '/dashboard/bookings',
    );
    expect(pane().getByTestId('staff-schedule-create-another')).toHaveAttribute(
      'href',
      '/dashboard/bookings/new?tipo=recorrencia',
    );
    expect(pane().queryByTestId('staff-schedule-change-pattern')).toBeNull();
  });

  it('lists the colliding dates on a conflict and returns to the pattern', () => {
    const onChangePattern = renderResult({
      kind: 'CONFLICT',
      conflicts: [{ occurrenceStart: '2026-10-19T12:00:00.000Z', reason: 'OCCUPIED' }],
    });

    const panel = screen.getByTestId('staff-schedule-outcome');
    expect(panel).toHaveAttribute('role', 'alert');
    expect(panel).toHaveTextContent('Não foi possível criar esta recorrência');
    expect(screen.getAllByTestId('conflict-item')).toHaveLength(1);

    fireEvent.click(pane().getByTestId('staff-schedule-change-pattern'));
    expect(onChangePattern).toHaveBeenCalledTimes(1);
  });

  it('shows the generic conflict sentence without a list when the body carried no dates', () => {
    renderResult({ kind: 'CONFLICT', conflicts: [] });

    expect(screen.getByTestId('staff-schedule-outcome')).toHaveTextContent(
      'Não foi possível criar esta recorrência',
    );
    expect(screen.queryByTestId('conflict-item')).toBeNull();
  });

  it('shows the limit panel without naming a resource', () => {
    renderResult({ kind: 'CAP_REACHED' });

    const panel = screen.getByTestId('staff-schedule-outcome');
    expect(panel).toHaveTextContent('Limite de reservas recorrentes atingido');
    expect(panel).not.toHaveTextContent('Sala Aurora');
    expect(pane().getByTestId('staff-schedule-change-pattern')).toBeVisible();
  });

  it.each([
    ['PHONE_NOT_SET', 'Ana Costa não tem telefone cadastrado'],
    ['CUSTOMER_NOT_FOUND', 'Cliente não encontrado'],
  ] as const)('sends staff back to the customer step on %s', (kind, title) => {
    renderResult({ kind });

    expect(screen.getByTestId('staff-schedule-outcome')).toHaveTextContent(title);
    expect(pane().getByTestId('staff-schedule-choose-other')).toHaveAttribute(
      'href',
      '/dashboard/bookings/new?tipo=recorrencia',
    );
    expect(pane().queryByTestId('staff-schedule-change-pattern')).toBeNull();
  });

  it('shows the failure panel with the pattern kept in the recap and a retry', () => {
    const onChangePattern = renderResult({ kind: 'FAILURE' });

    expect(screen.getByTestId('staff-schedule-outcome')).toHaveTextContent(
      'Não foi possível criar a recorrência',
    );
    expect(screen.getByText('Sala Aurora')).toBeVisible();
    fireEvent.click(pane().getByTestId('staff-schedule-change-pattern'));
    expect(onChangePattern).toHaveBeenCalledTimes(1);
  });
});
