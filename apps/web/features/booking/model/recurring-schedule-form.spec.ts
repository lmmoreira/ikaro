import { describe, expect, it } from 'vitest';
import { BookingErrorCode } from '@ikaro/types';
import { ApiError } from '@/shared/lib/api/errors';
import { choiceRequirement, hotsiteServiceBookingDefaults, makeHotsiteService } from '@/test-utils';
import {
  buildCreateRequest,
  checkFirstOccurrence,
  countOccurrences,
  earliestStartDate,
  filterRecurrenceEligibleServices,
  findFirstOccurrence,
  isRecurrenceEligibleService,
  latestEndsOn,
  mapCreateFailure,
  mapCreateSuccess,
  refusalForFirstOccurrence,
  requiresResourceChoice,
  resolveMaxTermDays,
  validateDraft,
  type RecurringScheduleDraft,
} from './recurring-schedule-form';

const TZ = 'America/Sao_Paulo'; // UTC-3, no DST
// Monday 2026-10-12 09:00 in São Paulo.
const NOW = new Date('2026-10-12T12:00:00Z');

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

function draft(overrides: Partial<RecurringScheduleDraft> = {}): RecurringScheduleDraft {
  return {
    serviceId: '00000000-0000-0000-0000-000000000001',
    resourceId: null,
    daysOfWeek: ['monday'],
    startTime: '10:00',
    startsOn: '2026-10-12',
    endsOn: '2026-11-09',
    ...overrides,
  };
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
      'two resource requirements',
      eligibleService(
        {},
        {
          resourceRequirements: [
            { type: 'ROOM', selectionMode: 'AUTO_ANY', requiredQuantity: 1 },
            { type: 'STAFF', selectionMode: 'AUTO_ANY', requiredQuantity: 1 },
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

  it('keeps only the eligible services of a list', () => {
    const eligible = eligibleService();
    expect(filterRecurrenceEligibleServices([makeHotsiteService(), eligible])).toEqual([eligible]);
  });
});

describe('resource choice and maximum term', () => {
  it('asks for a resource only for a CUSTOMER_CHOICE requirement', () => {
    expect(
      requiresResourceChoice(
        eligibleService({}, { resourceRequirements: [choiceRequirement('ROOM')] }),
      ),
    ).toBe(true);
    expect(requiresResourceChoice(eligibleService())).toBe(false);
  });

  it("uses the service's own maximum term, else the platform default of 90 days", () => {
    expect(resolveMaxTermDays(eligibleService({ recurringHorizonDays: 30 }))).toBe(30);
    expect(resolveMaxTermDays(eligibleService({ recurringHorizonDays: null }))).toBe(90);
  });

  it('puts the latest end date the term after the start date', () => {
    expect(latestEndsOn('2026-10-12', eligibleService({ recurringHorizonDays: 30 }))).toBe(
      '2026-11-11',
    );
    expect(latestEndsOn('2026-10-12', eligibleService())).toBe('2027-01-10');
  });
});

describe('validateDraft', () => {
  const service = eligibleService({ recurringHorizonDays: 30 });

  it('accepts a complete pattern', () => {
    expect(validateDraft(draft(), service)).toEqual([]);
  });

  it('requires at least one weekday', () => {
    expect(validateDraft(draft({ daysOfWeek: [] }), service)).toContain('WEEKDAY_REQUIRED');
  });

  it('requires an end date', () => {
    expect(validateDraft(draft({ endsOn: '' }), service)).toEqual(['END_REQUIRED']);
  });

  it('refuses an end date before the start date but allows an equal one', () => {
    expect(validateDraft(draft({ endsOn: '2026-10-11' }), service)).toEqual(['END_BEFORE_START']);
    expect(validateDraft(draft({ endsOn: '2026-10-12' }), service)).toEqual([]);
  });

  it('refuses an end date past the maximum term but allows one exactly at it', () => {
    expect(validateDraft(draft({ endsOn: '2026-11-12' }), service)).toEqual(['TERM_EXCEEDED']);
    expect(validateDraft(draft({ endsOn: '2026-11-11' }), service)).toEqual([]);
  });

  it('requires one resource for a CUSTOMER_CHOICE service', () => {
    const choice = eligibleService({}, { resourceRequirements: [choiceRequirement('ROOM')] });
    expect(validateDraft(draft(), choice)).toEqual(['RESOURCE_REQUIRED']);
    expect(validateDraft(draft({ resourceId: 'r-1' }), choice)).toEqual([]);
  });
});

describe('findFirstOccurrence / checkFirstOccurrence', () => {
  const service = eligibleService({
    effectiveMinBookingAdvanceHours: 0,
    effectiveMaxBookingAdvanceDays: 90,
  });

  it('finds the first chosen weekday on or after the start date, in the tenant timezone', () => {
    expect(findFirstOccurrence(draft({ daysOfWeek: ['wednesday'] }), TZ)?.toISOString()).toBe(
      '2026-10-14T13:00:00.000Z',
    );
  });

  it('is null when no chosen weekday falls in the term', () => {
    expect(
      findFirstOccurrence(draft({ daysOfWeek: ['tuesday'], endsOn: '2026-10-12' }), TZ),
    ).toBeNull();
    expect(
      checkFirstOccurrence(
        draft({ daysOfWeek: ['tuesday'], endsOn: '2026-10-12' }),
        service,
        NOW,
        TZ,
      ),
    ).toBe('NO_OCCURRENCES');
  });

  it('accepts a first occurrence inside the window', () => {
    expect(checkFirstOccurrence(draft(), service, NOW, TZ)).toBeNull();
  });

  it('refuses a first occurrence that has already started', () => {
    expect(checkFirstOccurrence(draft({ startTime: '08:00' }), service, NOW, TZ)).toBe(
      'SCHEDULED_IN_PAST',
    );
  });

  it('accepts a first occurrence exactly at the minimum notice and refuses one minute before it', () => {
    const oneHour = eligibleService({ effectiveMinBookingAdvanceHours: 1 });
    expect(checkFirstOccurrence(draft({ startTime: '10:00' }), oneHour, NOW, TZ)).toBeNull();
    expect(checkFirstOccurrence(draft({ startTime: '09:59' }), oneHour, NOW, TZ)).toBe('TOO_SOON');
  });

  it('accepts the last bookable day and refuses the day after it', () => {
    const week = eligibleService({ effectiveMaxBookingAdvanceDays: 7 }); // last day = Oct 18
    const lastDay = draft({ daysOfWeek: ['sunday'], endsOn: '2026-11-08' });
    expect(checkFirstOccurrence(lastDay, week, NOW, TZ)).toBeNull();
    const dayAfter = draft({
      daysOfWeek: ['monday'],
      startsOn: '2026-10-13',
      endsOn: '2026-11-08',
    });
    expect(checkFirstOccurrence(dayAfter, week, NOW, TZ)).toBe('TOO_FAR_AHEAD');
  });

  it("judges 'today' on the tenant calendar, not the runner's, near local midnight", () => {
    // 23:00 on Monday Oct 12 in São Paulo is already Tuesday 02:00 UTC.
    const lateNow = new Date('2026-10-13T02:00:00Z');
    expect(earliestStartDate(lateNow, TZ)).toBe('2026-10-12');
    expect(checkFirstOccurrence(draft({ startTime: '23:30' }), service, lateNow, TZ)).toBeNull();
    expect(findFirstOccurrence(draft({ startTime: '23:30' }), TZ)?.toISOString()).toBe(
      '2026-10-13T02:30:00.000Z',
    );
  });
});

describe('refusalForFirstOccurrence', () => {
  it('turns each first-occurrence problem into the notice the backend would have produced', () => {
    expect(refusalForFirstOccurrence('NO_OCCURRENCES')).toEqual({
      kind: 'NO_OCCURRENCES',
      code: BookingErrorCode.RECURRING_SCHEDULE_NO_OCCURRENCES,
    });
    expect(refusalForFirstOccurrence('SCHEDULED_IN_PAST')).toEqual({
      kind: 'BOOKING_WINDOW',
      code: BookingErrorCode.SCHEDULED_IN_PAST,
    });
    expect(refusalForFirstOccurrence('TOO_SOON')).toEqual({
      kind: 'BOOKING_WINDOW',
      code: BookingErrorCode.TOO_SOON,
    });
    expect(refusalForFirstOccurrence('TOO_FAR_AHEAD')).toEqual({
      kind: 'BOOKING_WINDOW',
      code: BookingErrorCode.TOO_FAR_AHEAD,
    });
  });
});

describe('countOccurrences', () => {
  it('counts every chosen weekday from the start date to the end date, both included', () => {
    // Mondays between Oct 12 and Nov 9: 12, 19, 26, 2, 9.
    expect(countOccurrences(draft())).toBe(5);
    expect(countOccurrences(draft({ daysOfWeek: ['monday', 'wednesday'] }))).toBe(9);
  });

  it('is zero until both dates are chosen or when no weekday falls in the term', () => {
    expect(countOccurrences(draft({ endsOn: '' }))).toBe(0);
    expect(countOccurrences(draft({ daysOfWeek: ['tuesday'], endsOn: '2026-10-12' }))).toBe(0);
  });
});

describe('buildCreateRequest', () => {
  it('builds a RESOLVE_PER_OCCURRENCE body with no resource for an auto-assigned service', () => {
    const service = eligibleService({}, { durationMinutes: 45 });
    expect(
      buildCreateRequest(
        draft({ daysOfWeek: ['wednesday', 'monday'], resourceId: 'ignored' }),
        service,
      ),
    ).toEqual({
      serviceId: '00000000-0000-0000-0000-000000000001',
      recurrence: {
        frequency: 'WEEKLY',
        daysOfWeek: ['monday', 'wednesday'],
        startTime: '10:00',
        durationMinutes: 45,
      },
      assignmentPolicy: 'RESOLVE_PER_OCCURRENCE',
      startsOn: '2026-10-12',
      endsOn: '2026-11-09',
    });
  });

  it('builds a FIXED_ASSIGNMENT body with exactly one resource for a CUSTOMER_CHOICE service', () => {
    const service = eligibleService({}, { resourceRequirements: [choiceRequirement('ROOM')] });
    const body = buildCreateRequest(draft({ resourceId: 'room-1' }), service);
    expect(body.assignmentPolicy).toBe('FIXED_ASSIGNMENT');
    expect(body.resourceIds).toEqual(['room-1']);
  });

  it('names the schedule being renewed only for a renewal', () => {
    const service = eligibleService();
    expect(buildCreateRequest(draft(), service)).not.toHaveProperty('renewsScheduleId');
    expect(buildCreateRequest(draft(), service, 'old-schedule').renewsScheduleId).toBe(
      'old-schedule',
    );
  });
});

describe('outcome mapping', () => {
  const problem = (status: number, data: Record<string, unknown>) =>
    new ApiError(status, 'x', { type: 't', title: 't', status, ...data });

  it('maps a 201 by its status', () => {
    const active = { id: 's', status: 'ACTIVE', approvalHoldExpiresAt: null } as const;
    const pending = {
      id: 's',
      status: 'PENDING_APPROVAL',
      approvalHoldExpiresAt: '2026-10-13T10:00:00Z',
    } as const;
    expect(mapCreateSuccess(active)).toEqual({ kind: 'ACTIVE', schedule: active });
    expect(mapCreateSuccess(pending)).toEqual({ kind: 'PENDING_APPROVAL', schedule: pending });
  });

  it('maps a 409 conflict to its occurrence list', () => {
    const conflicts = [
      { occurrenceStart: '2026-10-19T13:00:00Z', reason: 'OCCUPIED' },
      { occurrenceStart: '2026-10-26T13:00:00Z', reason: 'CLOSED' },
    ];
    expect(
      mapCreateFailure(
        problem(409, { code: BookingErrorCode.RECURRING_SCHEDULE_CONFLICT, conflicts }),
      ),
    ).toEqual({ kind: 'CONFLICT', conflicts });
  });

  it('falls back to an empty list when a 409 conflict carries no occurrences', () => {
    expect(
      mapCreateFailure(problem(409, { code: BookingErrorCode.RECURRING_SCHEDULE_CONFLICT })),
    ).toEqual({ kind: 'CONFLICT', conflicts: [] });
  });

  it.each([
    [409, BookingErrorCode.RECURRING_SCHEDULE_CAP_REACHED, { kind: 'CAP_REACHED' }],
    [
      422,
      BookingErrorCode.RECURRING_SCHEDULE_INVALID_DATE_RANGE,
      { kind: 'PATTERN_REFUSED', refusal: { kind: 'END_BEFORE_START' } },
    ],
    [
      422,
      BookingErrorCode.RECURRING_SCHEDULE_NO_OCCURRENCES,
      {
        kind: 'PATTERN_REFUSED',
        refusal: {
          kind: 'NO_OCCURRENCES',
          code: BookingErrorCode.RECURRING_SCHEDULE_NO_OCCURRENCES,
        },
      },
    ],
    [
      422,
      BookingErrorCode.SCHEDULED_IN_PAST,
      {
        kind: 'PATTERN_REFUSED',
        refusal: { kind: 'BOOKING_WINDOW', code: BookingErrorCode.SCHEDULED_IN_PAST },
      },
    ],
    [
      422,
      BookingErrorCode.TOO_SOON,
      {
        kind: 'PATTERN_REFUSED',
        refusal: { kind: 'BOOKING_WINDOW', code: BookingErrorCode.TOO_SOON },
      },
    ],
    [
      422,
      BookingErrorCode.TOO_FAR_AHEAD,
      {
        kind: 'PATTERN_REFUSED',
        refusal: { kind: 'BOOKING_WINDOW', code: BookingErrorCode.TOO_FAR_AHEAD },
      },
    ],
    [422, BookingErrorCode.RECURRING_SCHEDULE_INELIGIBLE_SERVICE, { kind: 'FAILURE' }],
  ])('maps %i %s', (status, code, expected) => {
    expect(mapCreateFailure(problem(status, { code }))).toEqual(expected);
  });

  it('reads the limit of a term-exceeded refusal from its params', () => {
    expect(
      mapCreateFailure(
        problem(422, {
          code: BookingErrorCode.RECURRING_SCHEDULE_TERM_EXCEEDED,
          params: { maxTermDays: 90, latestEndsOn: '2027-01-10' },
        }),
      ),
    ).toEqual({
      kind: 'PATTERN_REFUSED',
      refusal: { kind: 'TERM_EXCEEDED', maxTermDays: 90, latestEndsOn: '2027-01-10' },
    });
  });

  it('maps a 400 about the missing end date', () => {
    expect(
      mapCreateFailure(
        problem(400, { violations: [{ field: 'endsOn', code: 'GENERIC_FIELD_REQUIRED' }] }),
      ),
    ).toEqual({ kind: 'PATTERN_REFUSED', refusal: { kind: 'END_REQUIRED' } });
  });

  it('treats a 5xx, a network error and an unknown 400 as the generic failure', () => {
    expect(mapCreateFailure(new ApiError(503, 'down'))).toEqual({ kind: 'FAILURE' });
    expect(mapCreateFailure(new Error('Network Error'))).toEqual({ kind: 'FAILURE' });
    expect(mapCreateFailure(problem(400, { violations: [{ field: 'other', code: 'X' }] }))).toEqual(
      {
        kind: 'FAILURE',
      },
    );
  });
});
