import { describe, expect, it } from 'vitest';
import type { RecurringBookingScheduleListItem } from '@ikaro/types';
import { choiceRequirement, hotsiteServiceBookingDefaults, makeHotsiteService } from '@/test-utils';
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
      resourceId: null,
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
    const fixed = schedule({ assignmentPolicy: 'FIXED_ASSIGNMENT', resourceIds: ['room-b'] });

    expect(buildRenewalDraft(fixed, [roomService], '2026-10-01')?.resourceId).toBe('room-b');
  });

  it('leaves the resource empty when the schedule resolves it per occurrence', () => {
    expect(buildRenewalDraft(schedule(), [service], '2026-10-01')?.resourceId).toBeNull();
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
});
