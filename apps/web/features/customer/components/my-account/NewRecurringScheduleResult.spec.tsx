// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RecurringScheduleConflict } from '@ikaro/types';
import type { RecurringScheduleDraft } from '@/features/booking/model/recurring-schedule-form';
import { makeHotsiteService, renderWithIntl } from '@/test-utils';
import {
  NewRecurringScheduleResult,
  type NewScheduleResultOutcome,
} from './NewRecurringScheduleResult';

const SERVICE = makeHotsiteService({ name: 'Sala Aurora', durationMinutes: 120 });
const DRAFT: RecurringScheduleDraft = {
  serviceId: SERVICE.id,
  resourceId: null,
  daysOfWeek: ['tuesday'],
  startTime: '10:00',
  startsOn: '2026-08-18',
  endsOn: '2026-11-10',
};

function renderResult(
  outcome: NewScheduleResultOutcome,
  props: Partial<React.ComponentProps<typeof NewRecurringScheduleResult>> = {},
  locale = 'pt-BR',
) {
  const onChangePattern = vi.fn();
  const onRetry = vi.fn();
  renderWithIntl(
    <NewRecurringScheduleResult
      outcome={outcome}
      service={SERVICE}
      draft={DRAFT}
      tenantSlug="lavacar-bh"
      retrying={false}
      onChangePattern={onChangePattern}
      onRetry={onRetry}
      {...props}
    />,
    { locale },
  );
  return { onChangePattern, onRetry };
}

const conflict = (
  occurrenceStart: string,
  reason: RecurringScheduleConflict['reason'],
): RecurringScheduleConflict => ({ occurrenceStart, reason });

describe('NewRecurringScheduleResult', () => {
  it('created: says how many reservations were made and links to the new schedule', () => {
    renderResult({
      kind: 'ACTIVE',
      schedule: { id: 's-1', status: 'ACTIVE', approvalHoldExpiresAt: null },
    });

    expect(screen.getByText('Recorrência criada')).toBeInTheDocument();
    expect(
      screen.getByText(/Criamos as 13 reservas de 18\/08\/2026 a 10\/11\/2026/),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId('new-schedule-view')[0]).toHaveAttribute(
      'href',
      '/lavacar-bh/my-account/recurring-schedules/s-1',
    );
  });

  it('conflict with bookings only: the "em conflito" list, each occurrence labelled', () => {
    renderResult({
      kind: 'CONFLICT',
      conflicts: [
        conflict('2026-08-25T13:00:00.000Z', 'OCCUPIED'),
        conflict('2026-09-22T13:00:00.000Z', 'OCCUPIED'),
      ],
    });

    expect(screen.getByText('Ocorrências em conflito')).toBeInTheDocument();
    expect(screen.getAllByText('Já reservado')).toHaveLength(2);
    expect(screen.getByText(/Sala Aurora já tem um compromisso conflitante/)).toBeInTheDocument();
  });

  it('conflict with closed days and working hours: the mixed list, one label per reason', () => {
    renderResult({
      kind: 'CONFLICT',
      conflicts: [
        conflict('2026-08-25T13:00:00.000Z', 'OCCUPIED'),
        conflict('2026-09-15T13:00:00.000Z', 'CLOSED'),
        conflict('2026-10-06T13:00:00.000Z', 'OUTSIDE_HOURS'),
      ],
    });

    expect(screen.getByText('Ocorrências afetadas')).toBeInTheDocument();
    const items = screen.getAllByTestId('conflict-item');
    expect(within(items[1]!).getByText('Fechado')).toBeInTheDocument();
    expect(within(items[2]!).getByText('Fora do horário')).toBeInTheDocument();
    expect(items[0]).toHaveTextContent('10:00–12:00');
  });

  it('conflict without a list: only the translated generic message, no list', () => {
    renderResult({ kind: 'CONFLICT', conflicts: [] });

    expect(screen.queryByTestId('conflict-list')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Este padrão recorrente não pode ser reservado em uma ou mais das suas datas.',
    );
  });

  it('conflict: "Alterar padrão" returns to the pattern', () => {
    const { onChangePattern } = renderResult({
      kind: 'CONFLICT',
      conflicts: [conflict('2026-08-25T13:00:00.000Z', 'OCCUPIED')],
    });

    fireEvent.click(screen.getAllByTestId('new-schedule-change-pattern')[0]!);

    expect(onChangePattern).toHaveBeenCalledTimes(1);
  });

  it('cap reached: says nothing was created and offers the pattern and the list', () => {
    const { onChangePattern } = renderResult({ kind: 'CAP_REACHED' });

    expect(screen.getByText('Limite de reservas recorrentes atingido')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Ver minhas recorrências' })[0]).toHaveAttribute(
      'href',
      '/lavacar-bh/my-account/recurring-schedules',
    );
    fireEvent.click(screen.getAllByTestId('new-schedule-change-pattern')[0]!);
    expect(onChangePattern).toHaveBeenCalledTimes(1);
  });

  it('failure: retries, and locks the retry while it is on its way', () => {
    const { onRetry } = renderResult({ kind: 'FAILURE' });
    fireEvent.click(screen.getAllByTestId('new-schedule-retry')[0]!);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('failure: the retry button is disabled while retrying', () => {
    renderResult({ kind: 'FAILURE' }, { retrying: true });
    expect(screen.getAllByTestId('new-schedule-retry')[0]).toBeDisabled();
  });

  it('renders each state in English', () => {
    renderResult({ kind: 'CAP_REACHED' }, {}, 'en');
    expect(screen.getByText('Recurring reservation limit reached')).toBeInTheDocument();
  });
});
