import { describe, expect, it } from 'vitest';
import type { RecurringBookingScheduleListItem } from '@ikaro/types';
import {
  autoRequirement,
  choiceRequirement,
  hotsiteServiceBookingDefaults,
  makeHotsiteService,
} from '@/test-utils';
import { buildRenewalDraft } from './recurring-schedule-renewal';

function eligibleService(rest: Parameters<typeof makeHotsiteService>[0] = {}) {
  return makeHotsiteService({
    bookingPolicy: { ...hotsiteServiceBookingDefaults.bookingPolicy, recurrenceEligible: true },
    ...rest,
  });
}

function schedule(
  overrides: Partial<RecurringBookingScheduleListItem> = {},
): RecurringBookingScheduleListItem {
  return {
    id: 'old-1',
    customerId: 'c1',
    serviceId: '00000000-0000-0000-0000-000000000001',
    serviceName: 'Sala Aurora',
    recurrence: {
      frequency: 'WEEKLY',
      daysOfWeek: ['tuesday', 'thursday'],
      startTime: '10:00',
      durationMinutes: 120,
    },
    startsOn: '2026-08-19',
    endsOn: '2026-11-11',
    status: 'ENDED',
    assignmentPolicy: 'RESOLVE_PER_OCCURRENCE',
    resourceIds: [],
    approvalHoldExpiresAt: null,
    ...overrides,
  };
}

describe('buildRenewalDraft', () => {
  const service = eligibleService();

  it('keeps the service, weekdays and time, starts the day after the old term and leaves the end date to the customer', () => {
    expect(buildRenewalDraft(schedule(), [service], '2026-10-01')).toEqual({
      serviceId: service.id,
      resourceIds: [],
      daysOfWeek: ['tuesday', 'thursday'],
      startTime: '10:00',
      startsOn: '2026-11-12',
      endsOn: '',
    });
  });

  it('starts today when the day after the old term has already passed', () => {
    expect(buildRenewalDraft(schedule(), [service], '2026-12-05')?.startsOn).toBe('2026-12-05');
  });

  it('starts that day when the old term ended yesterday (the next day is today)', () => {
    expect(buildRenewalDraft(schedule(), [service], '2026-11-12')?.startsOn).toBe('2026-11-12');
  });

  it('carries the fixed resource of a customer-choice service', () => {
    const roomService = eligibleService({ resourceRequirements: [choiceRequirement('ROOM')] });
    const fixed = schedule({
      assignmentPolicy: 'FIXED_ASSIGNMENT',
      resourceIds: ['room-b'],
      resourceAssignments: [{ resourceType: 'ROOM', resourceId: 'room-b' }],
    });

    expect(buildRenewalDraft(fixed, [roomService], '2026-10-01')?.resourceIds).toEqual(['room-b']);
  });

  it('falls back to resourceIds for a response from before resourceAssignments existed', () => {
    const roomService = eligibleService({ resourceRequirements: [choiceRequirement('ROOM')] });
    const legacy = schedule({ assignmentPolicy: 'FIXED_ASSIGNMENT', resourceIds: ['room-b'] });

    expect(buildRenewalDraft(legacy, [roomService], '2026-10-01')?.resourceIds).toEqual(['room-b']);
  });

  it('leaves the resource empty when the schedule resolves it per occurrence', () => {
    expect(buildRenewalDraft(schedule(), [service], '2026-10-01')?.resourceIds).toEqual([]);
  });

  // TD49 Story 2: a bundle renews like any other service, picks matched by type and order.
  describe('a bundle', () => {
    const bundle = eligibleService({
      resourceRequirements: [
        choiceRequirement('STAFF'),
        autoRequirement('ROOM'),
        choiceRequirement('EQUIPMENT'),
      ],
    });
    const renewing = (overrides: Partial<RecurringBookingScheduleListItem>) =>
      buildRenewalDraft(
        schedule({ serviceId: bundle.id, assignmentPolicy: 'FIXED_ASSIGNMENT', ...overrides }),
        [bundle],
        '2026-10-01',
      );

    it('pre-fills each pick from the stored assignment of its resource type', () => {
      expect(
        renewing({
          resourceAssignments: [
            { resourceType: 'EQUIPMENT', resourceId: 'equip-1' },
            { resourceType: 'STAFF', resourceId: 'staff-1' },
          ],
        })?.resourceIds,
      ).toEqual(['staff-1', 'equip-1']);
    });

    it('leaves a pick empty when the schedule stored none for that type', () => {
      expect(
        renewing({ resourceAssignments: [{ resourceType: 'STAFF', resourceId: 'staff-1' }] })
          ?.resourceIds,
      ).toEqual(['staff-1', null]);
    });

    it('matches two same-type requirements to the stored picks in order', () => {
      const twoStaff = eligibleService({
        resourceRequirements: [choiceRequirement('STAFF'), choiceRequirement('STAFF')],
      });
      const draft = buildRenewalDraft(
        schedule({
          serviceId: twoStaff.id,
          assignmentPolicy: 'FIXED_ASSIGNMENT',
          resourceAssignments: [
            { resourceType: 'STAFF', resourceId: 'first' },
            { resourceType: 'STAFF', resourceId: 'second' },
          ],
        }),
        [twoStaff],
        '2026-10-01',
      );
      expect(draft?.resourceIds).toEqual(['first', 'second']);
    });

    it('stays eligible for renewal', () => {
      expect(renewing({ resourceAssignments: [] })).not.toBeNull();
    });
  });

  it('renews a schedule that is still running', () => {
    expect(
      buildRenewalDraft(schedule({ status: 'ACTIVE' }), [service], '2026-10-01'),
    ).not.toBeNull();
  });

  it.each(['PENDING_APPROVAL', 'CANCELLED'] as const)(
    'returns null for a %s schedule',
    (status) => {
      expect(buildRenewalDraft(schedule({ status }), [service], '2026-10-01')).toBeNull();
    },
  );

  it('returns null when the service is not among the eligible ones', () => {
    expect(buildRenewalDraft(schedule({ serviceId: 'other' }), [service], '2026-10-01')).toBeNull();
  });

  it('returns null when the service no longer allows recurrence', () => {
    expect(buildRenewalDraft(schedule(), [makeHotsiteService()], '2026-10-01')).toBeNull();
  });

  // TD49 Addendum item 7, decided in Story 3: a service that stopped qualifying (a requirement
  // of quantity two added since) opens the blank form with the not-found notice, never an error.
  it('returns null when the service stopped qualifying since the schedule was created', () => {
    const stricter = eligibleService({
      resourceRequirements: [
        choiceRequirement('ROOM'),
        { ...autoRequirement('STAFF'), requiredQuantity: 2 },
      ],
    });
    expect(
      buildRenewalDraft(schedule({ serviceId: stricter.id }), [stricter], '2026-10-01'),
    ).toBeNull();
  });

  it('renews a schedule of a default-shape service with no resource', () => {
    const plain = eligibleService({ resourceRequirements: [] });
    expect(
      buildRenewalDraft(schedule({ serviceId: plain.id }), [plain], '2026-10-01')?.resourceIds,
    ).toEqual([]);
  });
});
