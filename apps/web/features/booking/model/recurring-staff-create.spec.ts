import { describe, expect, it } from 'vitest';
import { BookingErrorCode } from '@ikaro/types';
import { ApiError } from '@/shared/lib/api/errors';
import {
  autoRequirement,
  choiceRequirement,
  hotsiteServiceBookingDefaults,
  makeHotsiteService,
} from '@/test-utils';
import { checkFirstOccurrence, type RecurringScheduleDraft } from './recurring-schedule-form';
import {
  buildStaffCreateRequest,
  checkStaffFirstOccurrence,
  mapStaffCreateFailure,
  mapStaffCreateSuccess,
} from './recurring-staff-create';

const TZ = 'America/Sao_Paulo'; // UTC-3, no DST
// Monday 2026-10-12 09:00 in São Paulo.
const NOW = new Date('2026-10-12T12:00:00Z');

const SERVICE = makeHotsiteService({
  durationMinutes: 120,
  bookingPolicy: {
    ...hotsiteServiceBookingDefaults.bookingPolicy,
    recurrenceEligible: true,
    // A notice and a horizon that would refuse a customer, to prove staff are exempt from both.
    effectiveMinBookingAdvanceHours: 48,
    effectiveMaxBookingAdvanceDays: 7,
  },
});

function draft(overrides: Partial<RecurringScheduleDraft> = {}): RecurringScheduleDraft {
  return {
    serviceId: SERVICE.id,
    resourceIds: [],
    daysOfWeek: ['monday'],
    startTime: '10:00',
    startsOn: '2026-10-12',
    endsOn: '2026-11-09',
    ...overrides,
  };
}

const problem = (status: number, data: Record<string, unknown>) =>
  new ApiError(status, 'x', { type: 't', title: 't', status, ...data });

describe('checkStaffFirstOccurrence', () => {
  it('accepts a start today inside the minimum notice, which a customer is refused', () => {
    // Today at 10:00 is one hour ahead of NOW: inside the 48 h notice.
    expect(checkFirstOccurrence(draft(), SERVICE, NOW, TZ)).toBe('TOO_SOON');
    expect(checkStaffFirstOccurrence(draft(), NOW, TZ)).toBeNull();
  });

  it('accepts a first occurrence beyond the maximum days ahead, which a customer is refused', () => {
    const far = draft({ startsOn: '2026-12-07', endsOn: '2026-12-28' });
    expect(checkFirstOccurrence(far, SERVICE, NOW, TZ)).toBe('TOO_FAR_AHEAD');
    expect(checkStaffFirstOccurrence(far, NOW, TZ)).toBeNull();
  });

  it('still refuses a first occurrence that has already started', () => {
    // Today at 08:00 is before NOW (09:00).
    expect(checkStaffFirstOccurrence(draft({ startTime: '08:00' }), NOW, TZ)).toBe(
      'SCHEDULED_IN_PAST',
    );
  });

  it('still refuses a term in which no chosen weekday occurs', () => {
    expect(
      checkStaffFirstOccurrence(draft({ endsOn: '2026-10-13', daysOfWeek: ['friday'] }), NOW, TZ),
    ).toBe('NO_OCCURRENCES');
  });

  it('never reports a booking-window issue', () => {
    const issues = [
      draft(),
      draft({ startsOn: '2026-12-07', endsOn: '2026-12-28' }),
      draft({ startTime: '08:00' }),
      draft({ daysOfWeek: [] }),
    ].map((candidate) => checkStaffFirstOccurrence(candidate, NOW, TZ));
    expect(issues).not.toContain('TOO_SOON');
    expect(issues).not.toContain('TOO_FAR_AHEAD');
  });
});

describe('buildStaffCreateRequest', () => {
  it('is the customer body plus the chosen customerId', () => {
    expect(buildStaffCreateRequest(draft(), SERVICE, 'cust-1')).toEqual({
      serviceId: SERVICE.id,
      recurrence: {
        frequency: 'WEEKLY',
        daysOfWeek: ['monday'],
        startTime: '10:00',
        durationMinutes: 120,
      },
      startsOn: '2026-10-12',
      endsOn: '2026-11-09',
      customerId: 'cust-1',
    });
  });

  it('sends one resourceSelections entry per customer-chosen requirement, keyed by type, and no resourceIds or assignmentPolicy', () => {
    const bundle = makeHotsiteService({
      bookingPolicy: SERVICE.bookingPolicy,
      resourceRequirements: [choiceRequirement('STAFF'), autoRequirement('ROOM')],
    });
    const body = buildStaffCreateRequest(draft({ resourceIds: ['staff-1'] }), bundle, 'cust-1');

    expect(body.resourceSelections).toEqual([{ resourceType: 'STAFF', resourceId: 'staff-1' }]);
    expect(body).not.toHaveProperty('resourceIds');
    expect(body).not.toHaveProperty('assignmentPolicy');
    expect(body.customerId).toBe('cust-1');
  });

  it('sends none for a service without a customer-chosen requirement', () => {
    const onlyAuto = makeHotsiteService({
      bookingPolicy: SERVICE.bookingPolicy,
      resourceRequirements: [autoRequirement('ROOM')],
    });
    expect(buildStaffCreateRequest(draft(), onlyAuto, 'cust-1')).not.toHaveProperty(
      'resourceSelections',
    );
  });

  it('sends a renewal reference to nobody — a staff creation is never a renewal', () => {
    expect(buildStaffCreateRequest(draft(), SERVICE, 'cust-1')).not.toHaveProperty(
      'renewsScheduleId',
    );
  });
});

describe('mapStaffCreateSuccess', () => {
  it('maps a created schedule to the created panel', () => {
    const response = { id: 's', status: 'ACTIVE', approvalHoldExpiresAt: null } as const;
    expect(mapStaffCreateSuccess(response)).toEqual({ kind: 'ACTIVE', schedule: response });
  });

  it('shows a pending answer as a failure: a staff schedule is never pending, so no panel exists for it', () => {
    expect(
      mapStaffCreateSuccess({
        id: 's',
        status: 'PENDING_APPROVAL',
        approvalHoldExpiresAt: '2026-10-13T10:00:00Z',
      }),
    ).toEqual({ kind: 'FAILURE' });
  });
});

describe('mapStaffCreateFailure', () => {
  it('maps the customer-not-found 404 to its own panel', () => {
    expect(
      mapStaffCreateFailure(problem(404, { code: BookingErrorCode.CUSTOMER_NOT_FOUND })),
    ).toEqual({ kind: 'CUSTOMER_NOT_FOUND' });
  });

  it('maps the customer-without-a-phone 422 to its own panel', () => {
    expect(
      mapStaffCreateFailure(problem(422, { code: BookingErrorCode.CUSTOMER_PHONE_NOT_SET })),
    ).toEqual({ kind: 'PHONE_NOT_SET' });
  });

  it('keeps every outcome the customer form already maps', () => {
    const conflicts = [{ occurrenceStart: '2026-10-19T13:00:00Z', reason: 'OCCUPIED' }];
    expect(
      mapStaffCreateFailure(
        problem(409, { code: BookingErrorCode.RECURRING_SCHEDULE_CONFLICT, conflicts }),
      ),
    ).toEqual({ kind: 'CONFLICT', conflicts });
    expect(
      mapStaffCreateFailure(
        problem(409, { code: BookingErrorCode.RECURRING_SCHEDULE_CAP_REACHED }),
      ),
    ).toEqual({ kind: 'CAP_REACHED' });
  });

  it.each([
    ['an end before the start', 422, BookingErrorCode.RECURRING_SCHEDULE_INVALID_DATE_RANGE],
    ['a start in the past', 422, BookingErrorCode.SCHEDULED_IN_PAST],
    ['a term with no occurrence', 422, BookingErrorCode.RECURRING_SCHEDULE_NO_OCCURRENCES],
  ])('sends %s back to the form with the pattern kept', (_label, status, code) => {
    expect(mapStaffCreateFailure(problem(status, { code }))).toMatchObject({
      kind: 'PATTERN_REFUSED',
    });
  });

  it('shows a network error, a 5xx and an unreachable code as the failure panel', () => {
    expect(mapStaffCreateFailure(new Error('network'))).toEqual({ kind: 'FAILURE' });
    expect(mapStaffCreateFailure(new ApiError(503, 'down'))).toEqual({ kind: 'FAILURE' });
    expect(
      mapStaffCreateFailure(
        problem(422, { code: BookingErrorCode.RECURRING_SCHEDULE_INELIGIBLE_SERVICE }),
      ),
    ).toEqual({ kind: 'FAILURE' });
    expect(
      mapStaffCreateFailure(problem(422, { code: BookingErrorCode.RESOURCE_SELECTION_REQUIRED })),
    ).toEqual({ kind: 'FAILURE' });
  });

  it('does not treat a customer-not-found code on another status as anything but that code', () => {
    // Branching is on the wire code only, never on the status or the message text.
    expect(
      mapStaffCreateFailure(problem(400, { code: BookingErrorCode.CUSTOMER_NOT_FOUND })),
    ).toEqual({ kind: 'CUSTOMER_NOT_FOUND' });
  });
});
