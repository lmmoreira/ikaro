// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { NewRecurringScheduleConflictList } from './NewRecurringScheduleConflictList';

describe('NewRecurringScheduleConflictList', () => {
  it('lists each occurrence with its window and the label and explanation of its reason', () => {
    renderWithIntl(
      <NewRecurringScheduleConflictList
        title="Ocorrências afetadas"
        durationMinutes={120}
        conflicts={[
          { occurrenceStart: '2026-08-25T13:00:00.000Z', reason: 'OCCUPIED' },
          { occurrenceStart: '2026-09-15T13:00:00.000Z', reason: 'CLOSED' },
          { occurrenceStart: '2026-10-06T13:00:00.000Z', reason: 'OUTSIDE_HOURS' },
        ]}
      />,
    );

    expect(screen.getByText('Ocorrências afetadas')).toBeInTheDocument();
    const items = screen.getAllByTestId('conflict-item');
    expect(items).toHaveLength(3);
    // 13:00Z is 10:00 in São Paulo; the window runs for the service's duration.
    expect(items[0]).toHaveTextContent('25/08/2026 · 10:00–12:00');
    expect(within(items[0]!).getByText('Já reservado')).toBeInTheDocument();
    expect(within(items[1]!).getByText('Fechado')).toBeInTheDocument();
    expect(within(items[1]!).getByText('Não há atendimento neste dia.')).toBeInTheDocument();
    expect(within(items[2]!).getByText('Fora do horário')).toBeInTheDocument();
  });

  it('keeps two reasons for the same start as two entries', () => {
    renderWithIntl(
      <NewRecurringScheduleConflictList
        title="x"
        durationMinutes={60}
        conflicts={[
          { occurrenceStart: '2026-08-25T13:00:00.000Z', reason: 'OCCUPIED' },
          { occurrenceStart: '2026-08-25T13:00:00.000Z', reason: 'OUTSIDE_HOURS' },
        ]}
      />,
    );
    expect(screen.getAllByTestId('conflict-item')).toHaveLength(2);
  });
});
