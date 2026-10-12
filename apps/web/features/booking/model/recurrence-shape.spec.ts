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
const staff = (selectionMode: Requirement['selectionMode']): Requirement => ({
  type: 'STAFF',
  selectionMode,
  requiredQuantity: 1,
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
    // A bundle: every requirement is checked, as the backend does (TD49 Story 2).
    [
      'a staff + room bundle, both customer-chosen',
      shape([staff('CUSTOMER_CHOICE'), room('CUSTOMER_CHOICE')]),
    ],
    [
      'a staff + room bundle, one chosen and one automatic',
      shape([staff('CUSTOMER_CHOICE'), room('AUTO_ANY')]),
    ],
    [
      'a staff + room bundle, both automatic',
      shape([staff('AUTO_ANY'), room('AUTO_FUNGIBLE_POOL')]),
    ],
    [
      'two customer-chosen staff requirements',
      shape([staff('CUSTOMER_CHOICE'), staff('CUSTOMER_CHOICE')]),
    ],
    ['an older location + staff service', shape([location('NONE'), staff('CUSTOMER_CHOICE')])],
    [
      'three requirements',
      shape([staff('CUSTOMER_CHOICE'), room('CUSTOMER_CHOICE'), room('AUTO_FUNGIBLE_POOL')]),
    ],
  ])('lets %s recur', (_label, input) => {
    expect(recurrenceShapeBlockers(input)).toEqual([]);
  });

  it.each<[string, RecurrenceShape, RecurrenceBlocker[]]>([
    ['a service with legs', shape([], { hasLegs: true }), ['legs']],
    // A bundle is eligible only when each of its requirements is; one bad requirement refuses it.
    [
      'a bundle with a requirement of quantity 2',
      shape([staff('CUSTOMER_CHOICE'), room('AUTO_FUNGIBLE_POOL', 2)]),
      ['quantity'],
    ],
    [
      'a bundle with a NONE room (NONE is for the unrestricted location only)',
      shape([staff('CUSTOMER_CHOICE'), room('NONE')]),
      ['selection-mode'],
    ],
    [
      'a bundle with a NONE location restricted to a pool',
      shape([location('NONE', ['r1']), staff('CUSTOMER_CHOICE')]),
      ['selection-mode'],
    ],
    [
      'a legged bundle',
      shape([staff('CUSTOMER_CHOICE'), room('AUTO_ANY')], { hasLegs: true }),
      ['legs'],
    ],
    [
      'a bundle that needs a pickup address',
      shape([staff('CUSTOMER_CHOICE'), room('AUTO_ANY')], { requiresPickupAddress: true }),
      ['pickup-address'],
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
