import {
  RecurringBookingScheduleExceptionAlreadyExistsError,
  RecurringBookingScheduleInvalidDateRangeError,
  RecurringBookingScheduleNotActiveError,
  RecurringBookingScheduleTermExceededError,
} from './errors/recurring-booking-schedule.error';
import { RecurringBookingScheduleCreated } from './events/recurring-booking-schedule-created.event';
import { RecurringBookingScheduleApprovalRequested } from './events/recurring-booking-schedule-approval-requested.event';
import { RecurringBookingSchedulePaused } from './events/recurring-booking-schedule-paused.event';
import { RecurringBookingScheduleEnded } from './events/recurring-booking-schedule-ended.event';
import {
  RecurringBookingSchedule,
  RequestRecurringBookingScheduleOptions,
} from './recurring-booking-schedule.aggregate';
import { ResourceType } from './resource.types';

const TENANT_ID = 'tenant-1';
const CORRELATION_ID = 'corr-1';

function requestOptions(
  overrides: Partial<RequestRecurringBookingScheduleOptions> = {},
): RequestRecurringBookingScheduleOptions {
  return {
    tenantId: TENANT_ID,
    customerId: 'customer-1',
    serviceId: 'service-1',
    recurrence: {
      frequency: 'WEEKLY',
      daysOfWeek: ['tuesday'],
      startTime: '10:00',
      durationMinutes: 120,
    },
    startsOn: '2026-09-01',
    endsOn: '2026-11-24',
    maxTermDays: 90,
    assignmentPolicy: 'FIXED_ASSIGNMENT',
    resourceAssignments: [
      {
        resourceId: 'res-1',
        resourceType: ResourceType.ROOM,
        requirementId: 'req-1',
        requiredQuantityPosition: null,
      },
    ],
    status: 'ACTIVE',
    approvalHoldExpiresAt: null,
    createdByStaffId: null,
    correlationId: CORRELATION_ID,
    ...overrides,
  };
}

describe('RecurringBookingSchedule.request', () => {
  it('creates an ACTIVE schedule and fires RecurringBookingScheduleCreated for AUTO_CONFIRM', () => {
    const schedule = RecurringBookingSchedule.request(requestOptions());

    expect(schedule.status).toBe('ACTIVE');
    expect(schedule.approvalHoldExpiresAt).toBeNull();
    const events = schedule.domainEvents;
    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(RecurringBookingScheduleCreated);
    expect(events[0].data.resourceIds).toEqual(['res-1']);
  });

  it('creates a PENDING_APPROVAL schedule and fires RecurringBookingScheduleApprovalRequested for MANUAL_APPROVAL', () => {
    const holdExpiresAt = new Date('2026-09-02T00:00:00.000Z');
    const schedule = RecurringBookingSchedule.request(
      requestOptions({ status: 'PENDING_APPROVAL', approvalHoldExpiresAt: holdExpiresAt }),
    );

    expect(schedule.status).toBe('PENDING_APPROVAL');
    expect(schedule.approvalHoldExpiresAt).toEqual(holdExpiresAt);
    const events = schedule.domainEvents;
    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(RecurringBookingScheduleApprovalRequested);
    expect(
      (events[0] as RecurringBookingScheduleApprovalRequested).data.approvalHoldExpiresAt,
    ).toBe(holdExpiresAt.toISOString());
  });

  it('stores createdByStaffId when staff creates on the customer’s behalf', () => {
    const schedule = RecurringBookingSchedule.request(
      requestOptions({ createdByStaffId: 'staff-1' }),
    );
    expect(schedule.createdByStaffId).toBe('staff-1');
  });

  it('stores zero resource assignments for RESOLVE_PER_OCCURRENCE', () => {
    const schedule = RecurringBookingSchedule.request(
      requestOptions({ assignmentPolicy: 'RESOLVE_PER_OCCURRENCE', resourceAssignments: [] }),
    );
    expect(schedule.resourceAssignments).toEqual([]);
  });

  it('rejects endsOn before startsOn', () => {
    expect(() =>
      RecurringBookingSchedule.request(
        requestOptions({ startsOn: '2026-09-10', endsOn: '2026-09-01' }),
      ),
    ).toThrow(RecurringBookingScheduleInvalidDateRangeError);
  });

  it('allows endsOn equal to startsOn', () => {
    const schedule = RecurringBookingSchedule.request(
      requestOptions({ startsOn: '2026-09-01', endsOn: '2026-09-01' }),
    );
    expect(schedule.endsOn).toBe('2026-09-01');
  });

  it('allows endsOn exactly at the maximum term', () => {
    const schedule = RecurringBookingSchedule.request(
      requestOptions({ startsOn: '2026-09-01', endsOn: '2026-11-30', maxTermDays: 90 }),
    );
    expect(schedule.endsOn).toBe('2026-11-30');
  });

  it('rejects endsOn one day past the maximum term and names the limit', () => {
    expect.assertions(3);
    try {
      RecurringBookingSchedule.request(
        requestOptions({ startsOn: '2026-09-01', endsOn: '2026-12-01', maxTermDays: 90 }),
      );
    } catch (err) {
      expect(err).toBeInstanceOf(RecurringBookingScheduleTermExceededError);
      expect((err as RecurringBookingScheduleTermExceededError).params).toEqual({
        maxTermDays: 90,
        latestEndsOn: '2026-11-30',
      });
      expect((err as RecurringBookingScheduleTermExceededError).code).toBe(
        'BOOKING_RECURRING_SCHEDULE_TERM_EXCEEDED',
      );
    }
  });

  it('uses the given maximum term, not a fixed 90 days', () => {
    expect(() =>
      RecurringBookingSchedule.request(
        requestOptions({ startsOn: '2026-09-01', endsOn: '2026-09-15', maxTermDays: 7 }),
      ),
    ).toThrow(RecurringBookingScheduleTermExceededError);
  });

  it('carries endsOn in the Created and ApprovalRequested event payloads', () => {
    const active = RecurringBookingSchedule.request(requestOptions());
    expect(active.domainEvents[0].data.endsOn).toBe('2026-11-24');

    const pending = RecurringBookingSchedule.request(
      requestOptions({
        status: 'PENDING_APPROVAL',
        approvalHoldExpiresAt: new Date('2026-09-02T00:00:00.000Z'),
      }),
    );
    expect(pending.domainEvents[0].data.endsOn).toBe('2026-11-24');
  });
});

describe('RecurringBookingSchedule occurrence exceptions', () => {
  function activeSchedule(): RecurringBookingSchedule {
    return RecurringBookingSchedule.request(requestOptions());
  }

  it('records a SKIPPED exception on an ACTIVE schedule', () => {
    const schedule = activeSchedule();
    const occurrenceStart = new Date('2026-09-08T13:00:00.000Z');

    schedule.skipOccurrence(occurrenceStart, 'CUSTOMER', 'customer-1', 'travelling');

    expect(schedule.exceptions).toHaveLength(1);
    expect(schedule.exceptions[0]).toMatchObject({
      occurrenceStart,
      kind: 'SKIPPED',
      replacementBookingId: null,
      actorType: 'CUSTOMER',
      actorId: 'customer-1',
      reason: 'travelling',
    });
  });

  it('records a RESCHEDULED exception with a replacementBookingId', () => {
    const schedule = activeSchedule();
    const occurrenceStart = new Date('2026-09-08T13:00:00.000Z');

    schedule.rescheduleOccurrence(occurrenceStart, 'booking-2', 'STAFF', 'staff-1', null);

    expect(schedule.exceptions[0]).toMatchObject({
      kind: 'RESCHEDULED',
      replacementBookingId: 'booking-2',
      actorType: 'STAFF',
      actorId: 'staff-1',
    });
  });

  it('rejects a duplicate exception for the same occurrenceStart', () => {
    const schedule = activeSchedule();
    const occurrenceStart = new Date('2026-09-08T13:00:00.000Z');
    schedule.skipOccurrence(occurrenceStart, 'CUSTOMER', 'customer-1', null);

    expect(() =>
      schedule.rescheduleOccurrence(occurrenceStart, 'booking-2', 'CUSTOMER', 'customer-1', null),
    ).toThrow(RecurringBookingScheduleExceptionAlreadyExistsError);
  });

  it('rejects skipOccurrence on a non-ACTIVE schedule', () => {
    const schedule = activeSchedule();
    schedule.pause(CORRELATION_ID);

    expect(() => schedule.skipOccurrence(new Date(), 'CUSTOMER', 'customer-1', null)).toThrow(
      RecurringBookingScheduleNotActiveError,
    );
  });

  it('rejects rescheduleOccurrence on a non-ACTIVE schedule', () => {
    const schedule = activeSchedule();
    schedule.pause(CORRELATION_ID);

    expect(() =>
      schedule.rescheduleOccurrence(new Date(), 'booking-2', 'CUSTOMER', 'customer-1', null),
    ).toThrow(RecurringBookingScheduleNotActiveError);
  });
});

describe('RecurringBookingSchedule.pause', () => {
  it('transitions ACTIVE to PAUSED and fires RecurringBookingSchedulePaused', () => {
    const schedule = RecurringBookingSchedule.request(requestOptions());
    schedule.clearDomainEvents();

    schedule.pause(CORRELATION_ID);

    expect(schedule.status).toBe('PAUSED');
    const events = schedule.domainEvents;
    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(RecurringBookingSchedulePaused);
  });

  it('rejects pausing a non-ACTIVE schedule', () => {
    const schedule = RecurringBookingSchedule.request(requestOptions());
    schedule.pause(CORRELATION_ID);

    expect(() => schedule.pause(CORRELATION_ID)).toThrow(RecurringBookingScheduleNotActiveError);
  });
});

describe('RecurringBookingSchedule.end', () => {
  it('transitions ACTIVE to CANCELLED with CUSTOMER_CANCELLED and fires RecurringBookingScheduleEnded', () => {
    const schedule = RecurringBookingSchedule.request(requestOptions());
    schedule.clearDomainEvents();

    schedule.end(CORRELATION_ID, ['booking-1', 'booking-2']);

    expect(schedule.status).toBe('CANCELLED');
    expect(schedule.cancellationReason).toBe('CUSTOMER_CANCELLED');
    const events = schedule.domainEvents;
    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(RecurringBookingScheduleEnded);
    expect((events[0] as RecurringBookingScheduleEnded).data.cancelledBookingIds).toEqual([
      'booking-1',
      'booking-2',
    ]);
  });

  it('rejects ending a non-ACTIVE schedule (e.g. already PAUSED)', () => {
    const schedule = RecurringBookingSchedule.request(requestOptions());
    schedule.pause(CORRELATION_ID);

    expect(() => schedule.end(CORRELATION_ID, [])).toThrow(RecurringBookingScheduleNotActiveError);
  });
});
