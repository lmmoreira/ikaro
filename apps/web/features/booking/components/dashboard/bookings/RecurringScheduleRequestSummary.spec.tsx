// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CustomerProfileResponse, RecurringBookingScheduleListItem } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import type { RecurringResourceRow } from '@/features/booking/model/recurring-approval';
import { RecurringScheduleRequestSummary } from './RecurringScheduleRequestSummary';

const CUSTOMER: CustomerProfileResponse = {
  customerId: 'cust-1',
  email: 'ana@email.com',
  name: 'Ana Costa',
  phone: '+5531999990000',
  defaultAddress: null,
};

function schedule(
  overrides: Partial<RecurringBookingScheduleListItem> = {},
): RecurringBookingScheduleListItem {
  return {
    id: 'sched-1',
    customerId: 'cust-1',
    serviceId: 'svc-1',
    serviceName: 'Reserva de sala',
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
    approvalHoldExpiresAt: '2026-08-11T12:30:00.000Z',
    createdAt: '2026-08-11T12:00:00.000Z',
    ...overrides,
  };
}

function renderSummary(props: Partial<Parameters<typeof RecurringScheduleRequestSummary>[0]> = {}) {
  return renderWithIntl(
    <RecurringScheduleRequestSummary
      schedule={schedule()}
      customer={CUSTOMER}
      customerFailed={false}
      resourceRows={[]}
      resourceNames={new Map()}
      {...props}
    />,
  );
}

function rows(): HTMLElement {
  return screen.getByTestId('recurring-request-rows');
}

describe('RecurringScheduleRequestSummary', () => {
  it('names the customer with their e-mail and initials', () => {
    renderSummary();

    const card = screen.getByTestId('recurring-customer');
    expect(within(card).getByText('Ana Costa')).toBeInTheDocument();
    expect(within(card).getByText('ana@email.com · cliente com conta')).toBeInTheDocument();
    expect(within(card).getByText('AC')).toBeInTheDocument();
  });

  it('shows the service, pattern, period and the most reservations the approval can create', () => {
    renderSummary();

    expect(within(rows()).getByText('Reserva de sala')).toBeInTheDocument();
    expect(within(rows()).getByText('Toda terça · 10:00–12:00')).toBeInTheDocument();
    expect(within(rows()).getByText('18/08/2026 → 10/11/2026')).toBeInTheDocument();
    // 18 Aug … 10 Nov 2026 holds 13 Tuesdays.
    expect(within(rows()).getByText('Até 13')).toBeInTheDocument();
  });

  it('shows "Solicitado em" from createdAt in the tenant time zone', () => {
    renderSummary();

    expect(within(rows()).getByText('Solicitado em')).toBeInTheDocument();
    // 12:00 UTC is 09:00 in São Paulo.
    expect(within(rows()).getByText('11/08/2026 às 09:00')).toBeInTheDocument();
  });

  it('hides the "Solicitado em" row when the read has no createdAt (older response)', () => {
    renderSummary({ schedule: schedule({ createdAt: undefined }) });

    expect(within(rows()).queryByText('Solicitado em')).not.toBeInTheDocument();
  });

  it('draws no resource row for a service with none (#simples)', () => {
    renderSummary({ resourceRows: [] });

    expect(within(rows()).queryByText('Sala')).not.toBeInTheDocument();
    expect(within(rows()).queryByText('Profissional')).not.toBeInTheDocument();
  });

  it('shows a picked resource by name, labelled by its type (#um)', () => {
    const picked: RecurringResourceRow[] = [{ kind: 'picked', type: 'ROOM', resourceId: 'room-1' }];
    renderSummary({ resourceRows: picked, resourceNames: new Map([['room-1', 'Sala Aurora']]) });

    expect(within(rows()).getByText('Sala')).toBeInTheDocument();
    expect(within(rows()).getByText('Sala Aurora')).toBeInTheDocument();
  });

  it('draws one row per requirement of a bundle, with "Resolvido a cada ocorrência" for the automatic one (#pacote)', () => {
    const bundle: RecurringResourceRow[] = [
      { kind: 'picked', type: 'ROOM', resourceId: 'room-1' },
      { kind: 'picked', type: 'EQUIPMENT', resourceId: 'eq-1' },
      { kind: 'automatic', type: 'STAFF' },
    ];
    renderSummary({
      resourceRows: bundle,
      resourceNames: new Map([
        ['room-1', 'Sala Aurora'],
        ['eq-1', 'Projetor 2'],
      ]),
    });

    expect(within(rows()).getByText('Sala Aurora')).toBeInTheDocument();
    expect(within(rows()).getByText('Equipamento')).toBeInTheDocument();
    expect(within(rows()).getByText('Projetor 2')).toBeInTheDocument();
    expect(within(rows()).getByText('Profissional')).toBeInTheDocument();
    expect(within(rows()).getByText('Resolvido a cada ocorrência')).toBeInTheDocument();
  });

  it('says "Recurso removido" for a pick whose resource name is unknown', () => {
    renderSummary({
      resourceRows: [{ kind: 'picked', type: 'ROOM', resourceId: 'gone' }],
      resourceNames: new Map(),
    });

    expect(within(rows()).getByText('Recurso removido')).toBeInTheDocument();
  });

  it('shows a loading line while the customer is read, and no initials', () => {
    renderSummary({ customer: undefined, customerFailed: false });

    const card = screen.getByTestId('recurring-customer');
    expect(within(card).getByText('Carregando cliente…')).toBeInTheDocument();
  });

  it('says the customer could not be read, and still shows the request', () => {
    renderSummary({ customer: undefined, customerFailed: true });

    expect(screen.getByText('Não foi possível ler os dados do cliente.')).toBeInTheDocument();
    expect(within(rows()).getByText('Reserva de sala')).toBeInTheDocument();
  });
});
