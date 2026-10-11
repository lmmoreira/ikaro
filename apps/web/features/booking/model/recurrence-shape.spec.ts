import { describe, expect, it } from 'vitest';
import {
  recurrenceShapeBlockers,
  type RecurrenceBlocker,
  type RecurrenceShape,
} from './recurrence-shape';

type Requirement = RecurrenceShape['resourceRequirements'][number];

const room = (selectionMode: Requirement['selectionMode'], requiredQuantity = 1): Requirement => ({
  type: 'ROOM',
  selectionMode,
  requiredQuantity,
});
const location = (
  selectionMode: Requirement['selectionMode'],
  resourcePoolIds?: string[],
): Requirement => ({ type: 'LOCATION', selectionMode, requiredQuantity: 1, resourcePoolIds });

function shape(
  resourceRequirements: Requirement[],
  rest: Partial<RecurrenceShape> = {},
): RecurrenceShape {
  return {
    bookingModel: 'APPOINTMENT',
    hasLegs: false,
    requiresPickupAddress: false,
    durationPolicy: 'FIXED',
    resourceRequirements,
    ...rest,
  };
}

// The rows mirror the backend's `assertServiceEligible` spec
// (recurring-booking-schedule-request.helpers.spec.ts) so the two rules are read side by side; the
// only web-only row is the customer-chosen duration.
describe('recurrenceShapeBlockers', () => {
  it.each([
    ['no requirement', shape([])],
    ['a stored unrestricted NONE location', shape([location('NONE')])],
    ['a stored NONE location with an empty pool list', shape([location('NONE', [])])],
    ['one CUSTOMER_CHOICE room', shape([room('CUSTOMER_CHOICE')])],
    ['one AUTO_ANY room', shape([room('AUTO_ANY')])],
    ['one AUTO_FUNGIBLE_POOL room', shape([room('AUTO_FUNGIBLE_POOL')])],
    ['an AUTO_ANY location', shape([location('AUTO_ANY')])],
  ])('lets %s recur', (_label, input) => {
    expect(recurrenceShapeBlockers(input)).toEqual([]);
  });

  it.each<[string, RecurrenceShape, RecurrenceBlocker[]]>([
    ['a service with legs', shape([], { hasLegs: true }), ['legs']],
    [
      'two requirements (staff + room)',
      shape([{ type: 'STAFF', selectionMode: 'AUTO_ANY', requiredQuantity: 1 }, room('AUTO_ANY')]),
      ['several-requirements'],
    ],
    ['a requirement of quantity 2', shape([room('AUTO_FUNGIBLE_POOL', 2)]), ['quantity']],
    [
      'a pickup-address service with no requirement',
      shape([], { requiresPickupAddress: true }),
      ['pickup-address'],
    ],
    [
      'a NONE room (NONE is for the unrestricted location only)',
      shape([room('NONE')]),
      ['selection-mode'],
    ],
    ['a NONE location restricted to a pool', shape([location('NONE', ['r1'])]), ['selection-mode']],
    ['a session service', shape([], { bookingModel: 'SESSION' }), ['not-appointment']],
    [
      'a customer-chosen duration (web only)',
      shape([], { durationPolicy: 'CUSTOMER_SELECTED' }),
      ['customer-duration'],
    ],
    [
      'several reasons at once',
      shape([room('AUTO_ANY', 2)], { hasLegs: true, requiresPickupAddress: true }),
      ['legs', 'quantity', 'pickup-address'],
    ],
  ])('names why %s cannot recur', (_label, input, expected) => {
    expect(recurrenceShapeBlockers(input)).toEqual(expected);
  });
});
