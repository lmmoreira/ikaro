import { describe, expect, it } from 'vitest';
import { hotsiteServiceBookingDefaults, makeHotsiteService } from '@/test-utils';
import {
  filterRecurrenceEligibleServices,
  isRecurrenceEligibleService,
  noRecurrenceServicesReason,
} from './recurring-service-eligibility';

function eligibleService(
  policy: Partial<(typeof hotsiteServiceBookingDefaults)['bookingPolicy']> = {},
  rest: Parameters<typeof makeHotsiteService>[0] = {},
) {
  return makeHotsiteService({
    bookingPolicy: {
      ...hotsiteServiceBookingDefaults.bookingPolicy,
      recurrenceEligible: true,
      ...policy,
    },
    ...rest,
  });
}

describe('isRecurrenceEligibleService', () => {
  it('accepts a recurrence-eligible single-resource appointment with a fixed duration', () => {
    expect(isRecurrenceEligibleService(eligibleService())).toBe(true);
  });

  it.each([
    ['not recurrence-eligible', makeHotsiteService()],
    ['a session service', eligibleService({}, { bookingModel: 'SESSION' })],
    [
      'a service with legs',
      eligibleService(
        {},
        {
          legs: [
            {
              legIndex: 0,
              name: 'Leg',
              durationMinutes: 30,
              resourceRequirements: [],
              transitionGapAfterMinutes: 0,
            },
          ],
        },
      ),
    ],
    [
      'a bundle with a requirement of quantity 2',
      eligibleService(
        {},
        {
          resourceRequirements: [
            { type: 'ROOM', selectionMode: 'AUTO_ANY', requiredQuantity: 1 },
            { type: 'STAFF', selectionMode: 'AUTO_ANY', requiredQuantity: 2 },
          ],
        },
      ),
    ],
    [
      'a bundle with a NONE room',
      eligibleService(
        {},
        {
          resourceRequirements: [
            { type: 'ROOM', selectionMode: 'NONE', requiredQuantity: 1 },
            { type: 'STAFF', selectionMode: 'CUSTOMER_CHOICE', requiredQuantity: 1 },
          ],
        },
      ),
    ],
    [
      'a requirement of quantity 2',
      eligibleService(
        {},
        {
          resourceRequirements: [{ type: 'ROOM', selectionMode: 'AUTO_ANY', requiredQuantity: 2 }],
        },
      ),
    ],
    ['a customer-selected duration', eligibleService({ durationPolicy: 'CUSTOMER_SELECTED' })],
  ])('rejects %s', (_label, service) => {
    expect(isRecurrenceEligibleService(service)).toBe(false);
  });

  it.each([
    ['no requirement', eligibleService({}, { resourceRequirements: [] })],
    [
      'the stored unrestricted NONE location (the default shape)',
      eligibleService(
        {},
        {
          resourceRequirements: [{ type: 'LOCATION', selectionMode: 'NONE', requiredQuantity: 1 }],
        },
      ),
    ],
  ])('accepts the default shape: %s (TD49-S03)', (_label, service) => {
    expect(isRecurrenceEligibleService(service)).toBe(true);
  });

  it.each([
    [
      'a NONE requirement on a room',
      eligibleService(
        {},
        { resourceRequirements: [{ type: 'ROOM', selectionMode: 'NONE', requiredQuantity: 1 }] },
      ),
    ],
    [
      'a service that requires a pickup address',
      eligibleService({}, { requiresPickupAddress: true }),
    ],
  ])('rejects %s, as the backend does', (_label, service) => {
    expect(isRecurrenceEligibleService(service)).toBe(false);
  });

  // TD49 Story 2: the form follows the backend and offers a bundle (every requirement checked).
  it.each([
    [
      'a staff + room bundle',
      [
        { type: 'STAFF', selectionMode: 'CUSTOMER_CHOICE', requiredQuantity: 1 },
        { type: 'ROOM', selectionMode: 'AUTO_ANY', requiredQuantity: 1 },
      ],
    ],
    [
      'an older location + staff service',
      [
        { type: 'LOCATION', selectionMode: 'NONE', requiredQuantity: 1 },
        { type: 'STAFF', selectionMode: 'CUSTOMER_CHOICE', requiredQuantity: 1 },
      ],
    ],
    [
      'a bundle of automatic requirements only',
      [
        { type: 'STAFF', selectionMode: 'AUTO_ANY', requiredQuantity: 1 },
        { type: 'EQUIPMENT', selectionMode: 'AUTO_FUNGIBLE_POOL', requiredQuantity: 1 },
      ],
    ],
  ] as const)('accepts %s', (_label, resourceRequirements) => {
    const service = eligibleService({}, { resourceRequirements: [...resourceRequirements] });
    expect(isRecurrenceEligibleService(service)).toBe(true);
  });

  it('keeps only the eligible services of a list', () => {
    const eligible = eligibleService();
    expect(filterRecurrenceEligibleServices([makeHotsiteService(), eligible])).toEqual([eligible]);
  });
});

describe('noRecurrenceServicesReason', () => {
  it('says no service has recurrence enabled when none does', () => {
    expect(noRecurrenceServicesReason([makeHotsiteService()])).toBe('NONE_ENABLED');
    expect(noRecurrenceServicesReason([])).toBe('NONE_ENABLED');
  });

  it('says none qualifies when a service has recurrence on but cannot recur', () => {
    const bundle = eligibleService(
      {},
      {
        resourceRequirements: [
          { type: 'ROOM', selectionMode: 'AUTO_ANY', requiredQuantity: 1 },
          { type: 'STAFF', selectionMode: 'AUTO_ANY', requiredQuantity: 1 },
        ],
      },
    );
    expect(noRecurrenceServicesReason([makeHotsiteService(), bundle])).toBe('NONE_QUALIFY');
  });
});
