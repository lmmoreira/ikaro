// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { BookingStatusHistoryEntry } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { BookingStatusHistory } from './BookingStatusHistory';

function entry(overrides: Partial<BookingStatusHistoryEntry>): BookingStatusHistoryEntry {
  return {
    fromStatus: 'APPROVED',
    toStatus: 'NO_SHOW',
    reason: null,
    actorType: 'MANAGER',
    actorId: 'staff-1',
    actorName: 'Ana Pereira',
    occurredAt: '2026-06-16T13:42:00.000Z',
    ...overrides,
  };
}

describe('BookingStatusHistory', () => {
  it('renders the entries in the order given, with the status transition and reason', () => {
    renderWithIntl(
      <BookingStatusHistory
        entries={[
          entry({ reason: 'Cliente não atendeu o telefone.' }),
          entry({
            fromStatus: 'NO_SHOW',
            toStatus: 'COMPLETED',
            reason: 'Cliente chegou atrasado e foi atendido.',
            occurredAt: '2026-06-16T14:05:00.000Z',
          }),
        ]}
      />,
    );

    const rows = screen.getAllByTestId('booking-status-history-entry');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('Aprovado → Não compareceu')).toBeInTheDocument();
    expect(
      within(rows[0]).getByText(/Motivo: Cliente não atendeu o telefone\./),
    ).toBeInTheDocument();
    expect(within(rows[1]).getByText('Não compareceu → Concluído')).toBeInTheDocument();
    expect(
      within(rows[1]).getByText(/Motivo: Cliente chegou atrasado e foi atendido\./),
    ).toBeInTheDocument();
  });

  it('shows the resolved name with the actor role', () => {
    renderWithIntl(<BookingStatusHistory entries={[entry({})]} />);

    expect(screen.getByText(/Ana Pereira \(Gerente\)/)).toBeInTheDocument();
  });

  it.each([
    ['MANAGER', 'Gerente'],
    ['STAFF', 'Equipe'],
    ['CUSTOMER', 'Cliente'],
    ['GUEST', 'Cliente'],
    ['SYSTEM', 'Sistema'],
  ] as const)('falls back to the %s role label when no name was resolved', (actorType, label) => {
    renderWithIntl(<BookingStatusHistory entries={[entry({ actorType, actorName: null })]} />);

    const row = screen.getByTestId('booking-status-history-entry');
    expect(within(row).getByText(new RegExp(`^${label} ·`))).toBeInTheDocument();
  });

  it('omits the reason when the transition has none', () => {
    renderWithIntl(<BookingStatusHistory entries={[entry({ reason: null })]} />);

    expect(screen.queryByText(/Motivo:/)).not.toBeInTheDocument();
  });

  it('renders the section title', () => {
    renderWithIntl(<BookingStatusHistory entries={[entry({})]} />);

    expect(screen.getByText('Histórico de status')).toBeInTheDocument();
  });
});
