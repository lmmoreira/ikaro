// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { HotsiteServiceLeg, HotsiteServiceResponse } from '@ikaro/types';
import { composeBasket, type ChosenDuration } from '@/features/booking/model/basket-lines';
import { choiceRequirement, makeHotsiteService, renderWithIntl } from '@/test-utils';
import { BasketLines, useBasketTotalText } from './BasketLines';

// 12:00Z is 09:00 in the default test tenant timezone (America/Sao_Paulo).
const SLOT = new Date('2026-06-15T12:00:00.000Z');

const fixed = makeHotsiteService({
  id: 'fixed',
  name: 'Avaliação Corporal',
  price: { amount: 80, currency: 'BRL', formatted: 'R$ 80,00' },
  durationMinutes: 30,
});

const legs: HotsiteServiceLeg[] = [
  {
    legIndex: 0,
    name: 'Sauna',
    durationMinutes: 20,
    transitionGapAfterMinutes: 10,
    resourceRequirements: [{ type: 'ROOM', selectionMode: 'AUTO_ANY', requiredQuantity: 1 }],
  },
  {
    legIndex: 1,
    name: 'Massagem',
    durationMinutes: 50,
    transitionGapAfterMinutes: 0,
    resourceRequirements: [choiceRequirement('STAFF')],
  },
];
const journey = makeHotsiteService({
  id: 'journey',
  name: 'Jornada Spa',
  price: { amount: 260, currency: 'BRL', formatted: 'R$ 260,00' },
  durationMinutes: 80,
  resourceRequirements: [],
  legs,
});

const variable = makeHotsiteService({
  id: 'variable',
  name: 'Alongamento',
  bookingPolicy: {
    ...makeHotsiteService().bookingPolicy,
    durationPolicy: 'CUSTOMER_SELECTED',
    durationMinMinutes: 60,
    durationMaxMinutes: 120,
    durationIncrementMinutes: 30,
    pricingPolicy: 'PER_TIME_INCREMENT',
    pricingIncrementMinutes: 60,
    pricePerIncrementAmount: 50,
  },
});

function basketOf(
  serviceIds: string[],
  duration: ChosenDuration | null = null,
  services: HotsiteServiceResponse[] = [fixed, journey, variable],
) {
  return composeBasket({
    services,
    serviceIds,
    picks: [{ serviceId: 'journey', legIndex: 1, resourceType: 'STAFF', resourceId: 'staff-1' }],
    requirements: [
      {
        serviceId: 'journey',
        legIndex: 1,
        resourceType: 'STAFF',
        selectionMode: 'CUSTOMER_CHOICE',
        requiredQuantity: 1,
        options: [{ resourceId: 'staff-1', name: 'Renata Souza' }],
      },
    ],
    duration,
    slotStart: SLOT,
  });
}

function Total({ ids, duration }: { ids: string[]; duration?: ChosenDuration | null }) {
  return <p data-testid="total">{useBasketTotalText(basketOf(ids, duration ?? null))}</p>;
}

describe('BasketLines', () => {
  it('lists plain lines as name and price only — no ranges — when there is no journey', () => {
    renderWithIntl(<BasketLines basket={basketOf(['fixed'])} variant="confirmation" />);

    const row = screen.getByTestId('basket-line');
    expect(row).toHaveTextContent('Avaliação CorporalR$ 80,00');
    expect(screen.queryByText(/–/)).not.toBeInTheDocument();
  });

  it('confirmation: a journey line gets its range and its full leg timeline, other lines a range', () => {
    renderWithIntl(<BasketLines basket={basketOf(['fixed', 'journey'])} variant="confirmation" />);

    const [fixedRow, journeyRow] = screen.getAllByTestId('basket-line');
    expect(within(fixedRow!).getByText('09:00 – 09:30 · 30 min')).toBeInTheDocument();
    expect(within(journeyRow!).getByText('09:30 – 10:50 · 1h 20min')).toBeInTheDocument();
    expect(within(journeyRow!).getAllByTestId('leg-item')).toHaveLength(2);
  });

  it('summary: a journey line is one compact row listing its stages, with no timeline', () => {
    renderWithIntl(<BasketLines basket={basketOf(['journey'])} variant="summary" />);

    expect(screen.getByText('2 etapas: Sauna · Massagem')).toBeInTheDocument();
    expect(screen.queryByTestId('leg-itinerary')).not.toBeInTheDocument();
    expect(screen.queryByTestId('line-own-pick')).not.toBeInTheDocument();
  });

  it('shows a per-time line as its "from" floor until it is quoted, then as the quote', () => {
    const { rerender } = renderWithIntl(
      <BasketLines basket={basketOf(['variable'])} variant="confirmation" />,
    );
    expect(screen.getByTestId('basket-line')).toHaveTextContent('a partir de R$ 50,00');

    rerender(
      <BasketLines
        basket={basketOf(['variable'], { minutes: 90, quotedAmount: 75 })}
        variant="confirmation"
      />,
    );
    expect(screen.getByTestId('basket-line')).toHaveTextContent('R$ 75,00');
  });
});

describe('useBasketTotalText', () => {
  it('is amount and duration for a settled basket', () => {
    renderWithIntl(<Total ids={['fixed', 'journey']} />);

    expect(screen.getByTestId('total')).toHaveTextContent('R$ 340,00 — 1h 50min');
  });

  it('is the "from" form with the duration still to choose while a quote is missing', () => {
    renderWithIntl(<Total ids={['fixed', 'variable']} />);

    expect(screen.getByTestId('total')).toHaveTextContent(
      'a partir de R$ 130,00 — duração a escolher',
    );
  });

  it('adds the quoted amount and duration once the variable line is quoted', () => {
    renderWithIntl(
      <Total ids={['fixed', 'variable']} duration={{ minutes: 90, quotedAmount: 75 }} />,
    );

    expect(screen.getByTestId('total')).toHaveTextContent('R$ 155,00 — 2h');
  });
});
