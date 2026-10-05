import { describe, expect, it } from 'vitest';
import type {
  HotsiteServiceLeg,
  HotsiteServiceResourceOptionsRequirement,
  HotsiteServiceResponse,
  ResourceSelectionItem,
} from '@ikaro/types';
import { choiceRequirement, makeHotsiteService } from '@/test-utils';
import { composeBasket, type ComposeBasketInput } from './basket-lines';

const FIXED_ID = '00000000-0000-0000-0000-0000000000b1';
const JOURNEY_ID = '00000000-0000-0000-0000-0000000000b2';
const VARIABLE_ID = '00000000-0000-0000-0000-0000000000b3';
const BUNDLE_ID = '00000000-0000-0000-0000-0000000000b4';
const SLOT = new Date('2026-08-18T16:00:00.000Z');

const fixed = makeHotsiteService({
  id: FIXED_ID,
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
    transitionGapAfterMinutes: 5,
    resourceRequirements: [
      choiceRequirement('STAFF'),
      { type: 'ROOM', selectionMode: 'AUTO_FUNGIBLE_POOL', requiredQuantity: 1 },
    ],
  },
  {
    legIndex: 2,
    name: 'Relaxamento',
    durationMinutes: 20,
    transitionGapAfterMinutes: 99,
    resourceRequirements: [
      choiceRequirement('EQUIPMENT'),
      { type: 'LOCATION', selectionMode: 'NONE', requiredQuantity: 1 },
    ],
  },
];

// A journey's persisted duration is its span: 20+10 + 50+5 + 20 (the last leg's gap never counts).
const journey = makeHotsiteService({
  id: JOURNEY_ID,
  name: 'Jornada Spa',
  price: { amount: 260, currency: 'BRL', formatted: 'R$ 260,00' },
  durationMinutes: 105,
  resourceRequirements: [],
  legs,
});

const variable = makeHotsiteService({
  id: VARIABLE_ID,
  name: 'Alongamento',
  price: { amount: 0, currency: 'BRL', formatted: 'R$ 0,00' },
  durationMinutes: 60,
  bookingPolicy: {
    ...makeHotsiteService().bookingPolicy,
    durationPolicy: 'CUSTOMER_SELECTED',
    durationMinMinutes: 60,
    durationMaxMinutes: 240,
    durationIncrementMinutes: 30,
    pricingPolicy: 'PER_TIME_INCREMENT',
    pricingIncrementMinutes: 60,
    pricePerIncrementAmount: 50,
    minimumChargeAmount: null,
  },
});

const bundle = makeHotsiteService({
  id: BUNDLE_ID,
  name: 'Massagem com sala',
  price: { amount: 180, currency: 'BRL', formatted: 'R$ 180,00' },
  durationMinutes: 60,
  resourceRequirements: [
    choiceRequirement('STAFF'),
    { type: 'ROOM', selectionMode: 'AUTO_ANY', requiredQuantity: 1 },
  ],
});

const requirements: HotsiteServiceResourceOptionsRequirement[] = [
  {
    serviceId: JOURNEY_ID,
    legIndex: 1,
    resourceType: 'STAFF',
    selectionMode: 'CUSTOMER_CHOICE',
    requiredQuantity: 1,
    options: [{ resourceId: 'staff-renata', name: 'Renata Souza' }],
  },
  {
    serviceId: JOURNEY_ID,
    legIndex: 2,
    resourceType: 'EQUIPMENT',
    selectionMode: 'CUSTOMER_CHOICE',
    requiredQuantity: 1,
    options: [{ resourceId: 'eq-1', name: 'Poltrona de relaxamento 1' }],
  },
  {
    serviceId: BUNDLE_ID,
    legIndex: null,
    resourceType: 'STAFF',
    selectionMode: 'CUSTOMER_CHOICE',
    requiredQuantity: 1,
    options: [{ resourceId: 'staff-renata', name: 'Renata Souza' }],
  },
];

const journeyPicks: ResourceSelectionItem[] = [
  { serviceId: JOURNEY_ID, legIndex: 1, resourceType: 'STAFF', resourceId: 'staff-renata' },
  { serviceId: JOURNEY_ID, legIndex: 2, resourceType: 'EQUIPMENT', resourceId: 'eq-1' },
];

function compose(overrides: Partial<ComposeBasketInput> & Pick<ComposeBasketInput, 'serviceIds'>) {
  const services: HotsiteServiceResponse[] = [fixed, journey, variable, bundle];
  return composeBasket({
    services,
    picks: [],
    requirements,
    duration: null,
    slotStart: SLOT,
    ...overrides,
  });
}

const iso = (date: Date | null) => date?.toISOString() ?? null;

describe('composeBasket', () => {
  it('composes a single fixed service: one row, its price and duration, no journey', () => {
    const basket = compose({ serviceIds: [FIXED_ID], slotStart: null });

    expect(basket.lines).toHaveLength(1);
    expect(basket.lines[0]).toMatchObject({
      name: 'Avaliação Corporal',
      amount: 80,
      priceFormatted: 'R$ 80,00',
      durationMinutes: 30,
      startsAt: null,
      legs: null,
    });
    expect(basket).toMatchObject({
      amount: 80,
      durationMinutes: 30,
      isFloor: false,
      hasJourney: false,
    });
  });

  it('places a journey after a fixed line where that line ends, not at the slot', () => {
    const basket = compose({ serviceIds: [FIXED_ID, JOURNEY_ID], picks: journeyPicks });

    const [fixedLine, journeyLine] = basket.lines;
    expect(iso(fixedLine.startsAt)).toBe('2026-08-18T16:00:00.000Z');
    expect(iso(fixedLine.endsAt)).toBe('2026-08-18T16:30:00.000Z');
    expect(iso(journeyLine.startsAt)).toBe('2026-08-18T16:30:00.000Z');
    expect(iso(journeyLine.endsAt)).toBe('2026-08-18T18:15:00.000Z');
    expect(journeyLine.legs?.map((leg) => [iso(leg.startsAt), iso(leg.endsAt)])).toEqual([
      ['2026-08-18T16:30:00.000Z', '2026-08-18T16:50:00.000Z'],
      ['2026-08-18T17:00:00.000Z', '2026-08-18T17:50:00.000Z'],
      ['2026-08-18T17:55:00.000Z', '2026-08-18T18:15:00.000Z'],
    ]);
    expect(basket).toMatchObject({ amount: 340, durationMinutes: 135, hasJourney: true });
    expect(iso(basket.endsAt)).toBe('2026-08-18T18:15:00.000Z');
  });

  it("never lets the last leg's transition gap count", () => {
    const [line] = compose({ serviceIds: [JOURNEY_ID] }).lines;

    expect(line.legs?.map((leg) => leg.transitionGapMinutes)).toEqual([10, 5, 0]);
  });

  it('follows selection order, not the catalogue order', () => {
    const basket = compose({ serviceIds: [JOURNEY_ID, FIXED_ID] });

    expect(basket.lines.map((line) => line.serviceId)).toEqual([JOURNEY_ID, FIXED_ID]);
    expect(iso(basket.lines[1].startsAt)).toBe('2026-08-18T17:45:00.000Z');
  });

  it('shows a per-time line as a floor until a duration is quoted, then as the quote', () => {
    const floor = compose({ serviceIds: [FIXED_ID, VARIABLE_ID] });
    expect(floor).toMatchObject({ amount: 130, durationMinutes: 30, isFloor: true });
    expect(floor.lines[1]).toMatchObject({ durationMinutes: null, endsAt: null });

    const pending = compose({
      serviceIds: [FIXED_ID, VARIABLE_ID],
      duration: { minutes: 90, quotedAmount: null },
    });
    expect(pending.isFloor).toBe(true);

    const quoted = compose({
      serviceIds: [FIXED_ID, VARIABLE_ID],
      duration: { minutes: 90, quotedAmount: 75 },
    });
    expect(quoted).toMatchObject({ amount: 155, durationMinutes: 120, isFloor: false });
    expect(iso(quoted.lines[1].endsAt)).toBe('2026-08-18T18:00:00.000Z');
  });

  it('composes a journey plus a variable-duration line (two lines, one total)', () => {
    const basket = compose({
      serviceIds: [JOURNEY_ID, VARIABLE_ID],
      picks: journeyPicks,
      duration: { minutes: 60, quotedAmount: 50 },
    });

    expect(basket).toMatchObject({
      amount: 310,
      durationMinutes: 165,
      hasJourney: true,
      isFloor: false,
    });
    expect(iso(basket.lines[1].startsAt)).toBe('2026-08-18T17:45:00.000Z');
    expect(iso(basket.endsAt)).toBe('2026-08-18T18:45:00.000Z');
  });

  it("labels a journey leg with the customer's own pick or the automatic resource's type", () => {
    const [line] = compose({ serviceIds: [JOURNEY_ID], picks: journeyPicks }).lines;

    expect(line.legs?.map((leg) => leg.resources)).toEqual([
      [{ kind: 'auto', type: 'ROOM' }],
      [
        { kind: 'chosen', type: 'STAFF', name: 'Renata Souza' },
        { kind: 'auto', type: 'ROOM' },
      ],
      [{ kind: 'chosen', type: 'EQUIPMENT', name: 'Poltrona de relaxamento 1' }],
    ]);
  });

  it("names only the customer's own pick on a bundle — the automatic room is never listed", () => {
    const picks: ResourceSelectionItem[] = [
      { serviceId: BUNDLE_ID, legIndex: null, resourceType: 'STAFF', resourceId: 'staff-renata' },
    ];

    const basket = compose({ serviceIds: [BUNDLE_ID, FIXED_ID], picks, slotStart: null });

    expect(basket.lines[0].resources).toEqual([
      { kind: 'chosen', type: 'STAFF', name: 'Renata Souza' },
    ]);
    expect(basket).toMatchObject({ amount: 260, durationMinutes: 90, hasJourney: false });
  });

  it('composes a journey plus a bundle: the bundle follows the journey, only own picks are named, one total', () => {
    const picks: ResourceSelectionItem[] = [
      ...journeyPicks,
      { serviceId: BUNDLE_ID, legIndex: null, resourceType: 'STAFF', resourceId: 'staff-renata' },
    ];

    const basket = compose({ serviceIds: [JOURNEY_ID, BUNDLE_ID], picks });

    const [journeyLine, bundleLine] = basket.lines;
    expect(iso(journeyLine!.endsAt)).toBe('2026-08-18T17:45:00.000Z');
    expect(iso(bundleLine!.startsAt)).toBe('2026-08-18T17:45:00.000Z');
    expect(iso(bundleLine!.endsAt)).toBe('2026-08-18T18:45:00.000Z');
    expect(journeyLine!.resources).toEqual([]);
    expect(bundleLine!.resources).toEqual([
      { kind: 'chosen', type: 'STAFF', name: 'Renata Souza' },
    ]);
    expect(basket).toMatchObject({ amount: 440, durationMinutes: 165, hasJourney: true });
  });

  it('skips a service id that is not in the catalogue', () => {
    const basket = compose({ serviceIds: ['missing', FIXED_ID] });

    expect(basket.lines.map((line) => line.serviceId)).toEqual([FIXED_ID]);
  });
});
