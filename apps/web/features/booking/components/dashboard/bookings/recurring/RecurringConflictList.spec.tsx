// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { RecurringScheduleConflict } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { RecurringConflictList } from './RecurringConflictList';

const CONFLICTS: RecurringScheduleConflict[] = [
  { occurrenceStart: '2026-08-25T13:00:00.000Z', reason: 'OCCUPIED' },
  { occurrenceStart: '2026-09-22T13:00:00.000Z', reason: 'CLOSED' },
  { occurrenceStart: '2026-09-29T13:00:00.000Z', reason: 'OUTSIDE_HOURS' },
];

describe('RecurringConflictList', () => {
  it('titles the list and shows one item per affected date, in the order given', () => {
    renderWithIntl(
      <RecurringConflictList
        conflicts={CONFLICTS}
        durationMinutes={120}
        title="Datas que não podem ser criadas"
      />,
    );

    expect(screen.getByText('Datas que não podem ser criadas')).toBeInTheDocument();
    const items = screen.getAllByTestId('conflict-item');
    expect(items.map((item) => item.dataset['reason'])).toEqual([
      'OCCUPIED',
      'CLOSED',
      'OUTSIDE_HOURS',
    ]);
  });

  it('shows the date with its start and end time in the tenant time zone', () => {
    renderWithIntl(
      <RecurringConflictList conflicts={CONFLICTS} durationMinutes={120} title="Datas" />,
    );

    // 13:00 UTC is 10:00 in São Paulo; the booking lasts 120 minutes.
    expect(screen.getAllByTestId('conflict-item')[0]).toHaveTextContent('25/08/2026 · 10:00–12:00');
  });

  it.each([
    ['OCCUPIED', 'Já reservado', 'Este horário já está comprometido com outra reserva.'],
    ['CLOSED', 'Fechado', 'Não há atendimento neste dia.'],
    ['OUTSIDE_HOURS', 'Fora do horário', 'fora do horário de funcionamento'],
  ] as const)('explains a %s conflict', (reason, label, detail) => {
    renderWithIntl(
      <RecurringConflictList
        conflicts={[{ occurrenceStart: '2026-08-25T13:00:00.000Z', reason }]}
        durationMinutes={60}
        title="Datas"
      />,
    );

    const item = screen.getByTestId('conflict-item');
    expect(within(item).getByText(label)).toBeInTheDocument();
    expect(item).toHaveTextContent(detail);
  });

  it('follows the locale', () => {
    renderWithIntl(
      <RecurringConflictList
        conflicts={[{ occurrenceStart: '2026-08-25T13:00:00.000Z', reason: 'OCCUPIED' }]}
        durationMinutes={60}
        title="Dates"
      />,
      { locale: 'en' },
    );

    expect(screen.getByTestId('conflict-item')).toHaveTextContent('Already booked');
  });
});
