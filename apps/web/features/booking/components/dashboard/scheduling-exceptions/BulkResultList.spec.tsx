// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { makeSchedulingException } from './scheduling-exception.fixtures';
import { BulkResultList } from './BulkResultList';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children?: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

const first = makeSchedulingException({ id: 'exc-1', booking: { contactName: 'João Silva' } });
const second = makeSchedulingException({ id: 'exc-2', booking: { contactName: 'Maria Oliveira' } });
const itemsById = new Map([
  [first.id, first],
  [second.id, second],
]);

function renderList(props: Partial<React.ComponentProps<typeof BulkResultList>> = {}) {
  const handlers = { onReassign: vi.fn(), onCancel: vi.fn(), onBack: vi.fn() };
  renderWithIntl(
    <BulkResultList
      itemsById={itemsById}
      results={[
        { exceptionId: 'exc-1', outcome: 'RESOLVED' },
        { exceptionId: 'exc-2', outcome: 'STILL_OPEN', errorCode: 'BOOKING_SLOT_UNAVAILABLE' },
      ]}
      notProcessed={[]}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

describe('BulkResultList', () => {
  it('summarises how many were resolved and how many stayed open', () => {
    renderList();

    expect(screen.getByText('1 reserva resolvida · 1 continua aberta')).toBeInTheDocument();
  });

  it('shows a resolved entry as resolved, with nothing left to do on it', () => {
    renderList();

    expect(screen.getByText('Resolvida')).toBeInTheDocument();
  });

  it('shows a still-open entry with its translated reason, and keeps its actions', () => {
    renderList();

    const reason = screen.getByTestId('still-open-reason');
    expect(reason).toHaveTextContent('Continua aberta:');
    // The backend code is translated through the error catalog, never shown raw.
    expect(reason).not.toHaveTextContent('BOOKING_SLOT_UNAVAILABLE');
    expect(screen.getByRole('button', { name: 'Reatribuir' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Reagendar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
  });

  it('falls back to a generic message for a code with no translation', () => {
    renderList({
      results: [{ exceptionId: 'exc-2', outcome: 'STILL_OPEN', errorCode: 'SOMETHING_NEW' }],
    });

    expect(screen.getByTestId('still-open-reason')).toHaveTextContent(
      'Continua aberta: Algo deu errado. Tente novamente.',
    );
  });

  it('acts on a still-open entry from the result list', async () => {
    const user = userEvent.setup();
    const h = renderList();

    await user.click(screen.getByRole('button', { name: 'Reatribuir' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(h.onReassign).toHaveBeenCalledWith('exc-2');
    expect(h.onCancel).toHaveBeenCalledWith('exc-2');
  });

  it('shows every unprocessed booking as its own open row, with a reason and its actions', () => {
    renderList({
      results: [{ exceptionId: 'exc-1', outcome: 'RESOLVED' }],
      notProcessed: ['exc-2'],
    });

    // The unsent ids are counted apart: the failed request may have partly applied.
    expect(screen.getByText('1 reserva resolvida')).toBeInTheDocument();
    expect(screen.getByTestId('scheduling-exceptions-not-processed')).toHaveTextContent(
      '1 reserva não foi processada',
    );
    const reason = screen.getByTestId('still-open-reason');
    expect(reason).toHaveTextContent('Continua aberta: a solicitação falhou antes de terminar');
    expect(screen.getByText('Maria Oliveira')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reatribuir' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
  });

  it('counts every unprocessed booking in the section total; an id missing from the snapshot is skipped', () => {
    renderList({
      results: [{ exceptionId: 'exc-1', outcome: 'RESOLVED' }],
      notProcessed: ['exc-2', 'exc-not-in-snapshot'],
    });

    expect(screen.getByText('3 reservas')).toBeInTheDocument();
    expect(screen.getAllByTestId('still-open-reason')).toHaveLength(1);
  });

  it('a result with everything resolved shows no "still open" part', () => {
    renderList({ results: [{ exceptionId: 'exc-1', outcome: 'RESOLVED' }] });

    expect(screen.getByText('1 reserva resolvida')).toBeInTheDocument();
    expect(screen.queryByTestId('still-open-reason')).not.toBeInTheDocument();
  });

  it('goes back to the list', async () => {
    const user = userEvent.setup();
    const h = renderList();

    await user.click(
      within(screen.getByTestId('scheduling-exceptions-result')).getByRole('button', {
        name: 'Voltar à lista',
      }),
    );

    expect(h.onBack).toHaveBeenCalled();
  });
});
