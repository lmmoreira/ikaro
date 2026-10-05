// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { BasketLeg } from '@/features/booking/model/basket-lines';
import { renderWithIntl } from '@/test-utils';
import { LegItineraryStep } from './LegItineraryStep';

// 16:00Z is 13:00 in the default test tenant timezone (America/Sao_Paulo).
const at = (time: string) => new Date(`2026-08-18T${time}:00.000Z`);

const legs: BasketLeg[] = [
  {
    legIndex: 0,
    name: 'Sauna',
    durationMinutes: 20,
    transitionGapMinutes: 10,
    startsAt: at('16:00'),
    endsAt: at('16:20'),
    resources: [{ kind: 'auto', type: 'ROOM' }],
  },
  {
    legIndex: 1,
    name: 'Massagem',
    durationMinutes: 50,
    transitionGapMinutes: 5,
    startsAt: at('16:30'),
    endsAt: at('17:20'),
    resources: [
      { kind: 'chosen', type: 'STAFF', name: 'Renata Souza' },
      { kind: 'auto', type: 'ROOM' },
    ],
  },
  {
    legIndex: 2,
    name: 'Relaxamento',
    durationMinutes: 20,
    transitionGapMinutes: 0,
    startsAt: at('17:25'),
    endsAt: at('17:45'),
    resources: [{ kind: 'chosen', type: 'EQUIPMENT', name: 'Poltrona de relaxamento 1' }],
  },
];

describe('LegItineraryStep', () => {
  it('lists every leg with its time range and name, in order', () => {
    renderWithIntl(<LegItineraryStep legs={legs} />);

    const items = screen.getAllByTestId('leg-item');
    expect(items).toHaveLength(3);
    expect(within(items[0]).getByText('13:00 – 13:20')).toBeInTheDocument();
    expect(within(items[0]).getByText('Sauna')).toBeInTheDocument();
    expect(within(items[1]).getByText('13:30 – 14:20')).toBeInTheDocument();
    expect(within(items[2]).getByText('14:25 – 14:45')).toBeInTheDocument();
  });

  it("names a resource only when it is the customer's own pick; an automatic one shows its type", () => {
    renderWithIntl(<LegItineraryStep legs={legs} />);

    const items = screen.getAllByTestId('leg-item');
    expect(within(items[0]).getByText('Sala atribuída automaticamente')).toBeInTheDocument();
    expect(
      within(items[1]).getByText('com Renata Souza (sua escolha) · Sala atribuída automaticamente'),
    ).toBeInTheDocument();
    expect(
      within(items[2]).getByText('com Poltrona de relaxamento 1 (sua escolha)'),
    ).toBeInTheDocument();
  });

  it('shows the transition after a leg that has one, never after the last', () => {
    renderWithIntl(<LegItineraryStep legs={legs} />);

    const items = screen.getAllByTestId('leg-item');
    expect(
      within(items[0]).getByText('+ 10 min de transição antes da próxima etapa'),
    ).toBeInTheDocument();
    expect(
      within(items[1]).getByText('+ 5 min de transição antes da próxima etapa'),
    ).toBeInTheDocument();
    expect(within(items[2]).queryByText(/transição/)).not.toBeInTheDocument();
  });

  it('sums the service time, the transitions and the reserved window', () => {
    renderWithIntl(<LegItineraryStep legs={legs} />);

    expect(screen.getByTestId('leg-reserved')).toHaveTextContent(
      '1h 30min de serviço + 15 min de transição = 1h 45min reservados (13:00–14:45)',
    );
  });

  it('omits the transition from the summary when no leg has one', () => {
    renderWithIntl(
      <LegItineraryStep legs={legs.map((leg) => ({ ...leg, transitionGapMinutes: 0 }))} />,
    );

    expect(screen.getByTestId('leg-reserved')).toHaveTextContent(
      '1h 30min reservados (13:00–14:45)',
    );
  });

  it('renders in English with the tenant time format', () => {
    renderWithIntl(<LegItineraryStep legs={legs} />, { locale: 'en' });

    expect(screen.getAllByTestId('leg-item')[0]).toHaveTextContent('Room assigned automatically');
    expect(screen.getByTestId('leg-reserved')).toHaveTextContent('reserved');
  });

  it('drops the time lines and the summary when the start is not known', () => {
    renderWithIntl(
      <LegItineraryStep legs={legs.map((leg) => ({ ...leg, startsAt: null, endsAt: null }))} />,
    );

    expect(screen.getAllByTestId('leg-item')).toHaveLength(3);
    expect(screen.queryByText(/–/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('leg-reserved')).not.toBeInTheDocument();
  });
});
