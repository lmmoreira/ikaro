// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { RecurringBookingScheduleListItem } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import type { DecisionOutcome } from '@/features/booking/model/recurring-approval-outcome';
import { RecurringApprovalBanner } from './RecurringApprovalBanner';

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
    approvalHoldExpiresAt: '2099-08-11T12:30:00.000Z',
    ...overrides,
  };
}

function renderBanner(outcome: DecisionOutcome | null, isPending = true, holdExpired = false) {
  return renderWithIntl(
    <RecurringApprovalBanner
      outcome={outcome}
      schedule={schedule()}
      customerName="Ana Costa"
      isPending={isPending}
      holdExpired={holdExpired}
    />,
  );
}

describe('RecurringApprovalBanner — no decision yet', () => {
  it('states the deadline in the tenant time zone while the request is pending', () => {
    renderBanner(null);

    const banner = screen.getByTestId('recurring-hold-banner');
    expect(banner).toHaveTextContent('Decidir até 09:30.');
    expect(banner).toHaveTextContent('o pedido expira sozinho e nenhuma reserva é criada');
  });

  it('shows nothing for a request that is not pending', () => {
    const { container } = renderBanner(null, false);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows nothing when the request carries no deadline', () => {
    const { container } = renderWithIntl(
      <RecurringApprovalBanner
        outcome={null}
        schedule={schedule({ approvalHoldExpiresAt: null })}
        customerName="Ana Costa"
        isPending
        holdExpired={false}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('says the deadline has passed, and that only rejecting is left, once the hold expired', () => {
    renderBanner(null, true, true);

    const banner = screen.getByTestId('recurring-hold-expired-banner');
    expect(banner).toHaveTextContent('O prazo para decidir terminou às 09:30.');
    expect(banner).toHaveTextContent('Não é mais possível aprovar este pedido');
    expect(banner).toHaveTextContent('Recuse-o');
    expect(screen.queryByTestId('recurring-hold-banner')).not.toBeInTheDocument();
  });
});

describe('RecurringApprovalBanner — outcomes (08b)', () => {
  it('approved: counts the reservations created over the period', () => {
    // 18 Aug … 10 Nov 2026 holds 13 Tuesdays.
    renderBanner({ kind: 'approved', created: 13 });

    const banner = screen.getByTestId('recurring-outcome-approved');
    expect(banner).toHaveTextContent('Recorrência aprovada');
    expect(banner).toHaveTextContent('Criamos as 13 reservas de 18/08/2026 a 10/11/2026');
    expect(banner).toHaveTextContent('Ana Costa recebe um e-mail avisando.');
  });

  it('approved with fewer: reports the response count, not the estimate (#aprovada-parcial)', () => {
    renderBanner({ kind: 'approved', created: 12 });

    const banner = screen.getByTestId('recurring-outcome-approved-partial');
    expect(banner).toHaveTextContent('Recorrência aprovada — 12 de 13 reservas criadas');
    expect(banner).toHaveTextContent('Criamos 12 reservas');
    expect(banner).toHaveTextContent('não foram criadas');
    expect(screen.queryByTestId('recurring-outcome-approved')).not.toBeInTheDocument();
  });

  it('rejected: says nothing was created', () => {
    renderBanner({ kind: 'rejected' });

    const banner = screen.getByTestId('recurring-outcome-rejected');
    expect(banner).toHaveTextContent('Recorrência recusada');
    expect(banner).toHaveTextContent('Nenhuma reserva foi criada.');
  });

  it('conflict: lists every affected date with its reason, and says the request stays pending (#conflito)', () => {
    renderBanner({
      kind: 'conflict',
      conflicts: [
        { occurrenceStart: '2026-08-25T13:00:00.000Z', reason: 'OCCUPIED' },
        { occurrenceStart: '2026-09-22T13:00:00.000Z', reason: 'CLOSED' },
      ],
    });

    const banner = screen.getByTestId('recurring-outcome-conflict');
    expect(banner).toHaveTextContent('Não foi possível aprovar esta recorrência');
    expect(banner).toHaveTextContent('o pedido continua aguardando decisão');
    const items = within(banner).getAllByTestId('conflict-item');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveAttribute('data-reason', 'OCCUPIED');
    expect(items[0]).toHaveTextContent('Já reservado');
    expect(items[1]).toHaveAttribute('data-reason', 'CLOSED');
    expect(items[1]).toHaveTextContent('Fechado');
  });

  it('conflict with no dates in the body: still explains the refusal, without an empty list', () => {
    renderBanner({ kind: 'conflict', conflicts: [] });

    expect(screen.getByTestId('recurring-outcome-conflict')).toBeInTheDocument();
    expect(screen.queryByTestId('conflict-list')).not.toBeInTheDocument();
  });

  // The refusals that keep the request pending (and #expirada): each states what happened and what
  // staff can do next, in the copy drawn in 08b.
  it.each([
    [
      '#telefone — names the customer and the deadline',
      { kind: 'phone' },
      'recurring-outcome-phone',
      ['Ana Costa não tem telefone cadastrado', 'aprove de novo antes das 09:30'],
    ],
    [
      '#passada — says every date has passed and suggests rejecting',
      { kind: 'past' },
      'recurring-outcome-past',
      ['Todas as datas deste pedido já passaram', 'recuse-o'],
    ],
    [
      '#inelegivel — says the service no longer takes recurring bookings',
      { kind: 'ineligible' },
      'recurring-outcome-ineligible',
      ['Este serviço não aceita mais reserva recorrente', 'antes das 09:30'],
    ],
    [
      '#expirada — someone else decided or the hold expired',
      { kind: 'notPending' },
      'recurring-outcome-not-pending',
      ['Este pedido não está mais aguardando decisão', 'Outra pessoa da equipe já decidiu'],
    ],
    [
      '#falha — says nothing changed',
      { kind: 'failure', action: 'approve' },
      'recurring-outcome-failure',
      ['Não foi possível concluir a decisão', 'Nada mudou.'],
    ],
  ] as [string, DecisionOutcome, string, string[]][])(
    '%s',
    (_label, outcome, testId, expectedTexts) => {
      renderBanner(outcome);

      const banner = screen.getByTestId(testId);
      for (const text of expectedTexts) expect(banner).toHaveTextContent(text);
    },
  );
});
