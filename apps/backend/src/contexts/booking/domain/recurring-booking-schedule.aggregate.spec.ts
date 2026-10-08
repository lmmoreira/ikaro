import {
  RecurringBookingScheduleInvalidDateRangeError,
  RecurringBookingScheduleNotActiveError,
  RecurringBookingScheduleNotPendingApprovalError,
  RecurringBookingScheduleTermExceededError,
} from './errors/recurring-booking-schedule.error';
import { RecurringBookingScheduleCreated } from './events/recurring-booking-schedule-created.event';
import { RecurringBookingScheduleApprovalRequested } from './events/recurring-booking-schedule-approval-requested.event';
import { RecurringBookingScheduleEnded } from './events/recurring-booking-schedule-ended.event';
import { RecurringBookingScheduleRejected } from './events/recurring-booking-schedule-rejected.event';
import {
  RecurringBookingSchedule,
  RequestRecurringBookingScheduleOptions,
} from './recurring-booking-schedule.aggregate';
import { ResourceType } from './resource.types';
import { TimeOfDay } from '../../../shared/value-objects/time-of-day.vo';

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

describe('RecurringBookingSchedule.reassignResource', () => {
  function activeSchedule(
    overrides: Partial<RequestRecurringBookingScheduleOptions> = {},
  ): RecurringBookingSchedule {
    return RecurringBookingSchedule.request(requestOptions(overrides));
  }

  // A schedule rebuilt from persistence — the state every mutation use case works on.
  function persisted(schedule: RecurringBookingSchedule): RecurringBookingSchedule {
    return RecurringBookingSchedule.reconstitute({
      id: schedule.id,
      tenantId: schedule.tenantId,
      customerId: schedule.customerId,
      serviceId: schedule.serviceId,
      recurrence: {
        ...schedule.recurrence,
        startTime: TimeOfDay.create(schedule.recurrence.startTime),
      },
      startsOn: schedule.startsOn,
      endsOn: schedule.endsOn,
      status: schedule.status,
      assignmentPolicy: schedule.assignmentPolicy,
      resourceAssignments: schedule.resourceAssignments,
      approvalHoldExpiresAt: schedule.approvalHoldExpiresAt,
      approvedByStaffId: schedule.approvedByStaffId,
      approvedAt: schedule.approvedAt,
      cancellationReason: schedule.cancellationReason,
      createdByStaffId: schedule.createdByStaffId,
      createdAt: schedule.createdAt,
      updatedAt: schedule.updatedAt,
      version: 1,
    });
  }

  it('swaps the assignment to the new resource, keeping its requirement and type', () => {
    const schedule = persisted(activeSchedule());

    schedule.reassignResource('res-1', 'res-2');

    expect(schedule.resourceAssignments).toHaveLength(1);
    expect(schedule.resourceAssignments[0]).toMatchObject({
      resourceId: 'res-2',
      resourceType: ResourceType.ROOM,
      requirementId: 'req-1',
    });
  });

  it('flags the assignments dirty only once they change', () => {
    const schedule = persisted(activeSchedule());
    expect(schedule.resourceAssignmentsModified).toBe(false);

    schedule.reassignResource('res-1', 'res-2');

    expect(schedule.resourceAssignmentsModified).toBe(true);
  });

  it('is a no-op when the schedule was not assigned to the old resource', () => {
    const schedule = persisted(activeSchedule());

    schedule.reassignResource('res-9', 'res-2');

    expect(schedule.resourceAssignments[0].resourceId).toBe('res-1');
    expect(schedule.resourceAssignmentsModified).toBe(false);
  });

  it('drops the old row when the new resource is already assigned (multi-unit requirement)', () => {
    const schedule = persisted(
      activeSchedule({
        resourceAssignments: [
          {
            resourceId: 'res-1',
            resourceType: ResourceType.ROOM,
            requirementId: 'req-1',
            requiredQuantityPosition: 1,
          },
          {
            resourceId: 'res-2',
            resourceType: ResourceType.ROOM,
            requirementId: 'req-1',
            requiredQuantityPosition: 2,
          },
        ],
      }),
    );

    schedule.reassignResource('res-1', 'res-2');

    expect(schedule.resourceAssignments.map((a) => a.resourceId)).toEqual(['res-2']);
  });

  it('a freshly requested schedule reports its assignments as modified so the first save inserts them', () => {
    expect(activeSchedule().resourceAssignmentsModified).toBe(true);
  });

  it('rejects a non-ACTIVE schedule', () => {
    const schedule = activeSchedule();
    schedule.end(CORRELATION_ID, [], 'CUSTOMER');

    expect(() => schedule.reassignResource('res-1', 'res-2')).toThrow(
      RecurringBookingScheduleNotActiveError,
    );
  });
});

describe('RecurringBookingSchedule.end', () => {
  it('transitions ACTIVE to CANCELLED with CUSTOMER_CANCELLED and fires RecurringBookingScheduleEnded', () => {
    const schedule = RecurringBookingSchedule.request(requestOptions());
    schedule.clearDomainEvents();

    schedule.end(CORRELATION_ID, ['booking-1', 'booking-2'], 'CUSTOMER');

    expect(schedule.status).toBe('CANCELLED');
    expect(schedule.cancellationReason).toBe('CUSTOMER_CANCELLED');
    const events = schedule.domainEvents;
    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(RecurringBookingScheduleEnded);
    expect((events[0] as RecurringBookingScheduleEnded).data.cancelledBookingIds).toEqual([
      'booking-1',
      'booking-2',
    ]);
    expect((events[0] as RecurringBookingScheduleEnded).data.endedBy).toBe('CUSTOMER');
  });

  it('records STAFF_CANCELLED and endedBy STAFF when staff end the schedule', () => {
    const schedule = RecurringBookingSchedule.request(requestOptions());
    schedule.clearDomainEvents();

    schedule.end(CORRELATION_ID, [], 'STAFF');

    expect(schedule.cancellationReason).toBe('STAFF_CANCELLED');
    expect((schedule.domainEvents[0] as RecurringBookingScheduleEnded).data.endedBy).toBe('STAFF');
  });

  it('rejects ending a non-ACTIVE schedule (e.g. already ended)', () => {
    const schedule = RecurringBookingSchedule.request(requestOptions());
    schedule.end(CORRELATION_ID, [], 'CUSTOMER');

    expect(() => schedule.end(CORRELATION_ID, [], 'CUSTOMER')).toThrow(
      RecurringBookingScheduleNotActiveError,
    );
  });
});

function pendingSchedule(holdExpiresAt = new Date('2999-01-01T00:00:00.000Z')) {
  const schedule = RecurringBookingSchedule.request(
    requestOptions({ status: 'PENDING_APPROVAL', approvalHoldExpiresAt: holdExpiresAt }),
  );
  schedule.clearDomainEvents();
  return schedule;
}

describe('RecurringBookingSchedule.approve', () => {
  it('activates a pending request, records the approver, clears the hold and fires Created', () => {
    const schedule = pendingSchedule();
    const now = new Date('2026-09-01T12:00:00.000Z');

    schedule.approve('staff-1', CORRELATION_ID, now);

    expect(schedule.status).toBe('ACTIVE');
    expect(schedule.approvedByStaffId).toBe('staff-1');
    expect(schedule.approvedAt).toEqual(now);
    expect(schedule.approvalHoldExpiresAt).toBeNull();
    const events = schedule.domainEvents;
    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(RecurringBookingScheduleCreated);
    expect(events[0].data.resourceIds).toEqual(['res-1']);
  });

  it.each(['ACTIVE', 'CANCELLED', 'ENDED'] as const)('refuses a %s schedule', (status) => {
    const schedule = RecurringBookingSchedule.request(requestOptions());
    if (status === 'CANCELLED') schedule.end(CORRELATION_ID, [], 'CUSTOMER');
    if (status === 'ENDED') schedule.markEnded();

    expect(() => schedule.approve('staff-1', CORRELATION_ID)).toThrow(
      RecurringBookingScheduleNotPendingApprovalError,
    );
  });

  it('refuses a request whose hold has passed even though the expiry job has not run yet', () => {
    const schedule = pendingSchedule(new Date('2026-09-01T00:00:00.000Z'));

    expect(() =>
      schedule.approve('staff-1', CORRELATION_ID, new Date('2026-09-01T00:00:00.000Z')),
    ).toThrow(RecurringBookingScheduleNotPendingApprovalError);
    expect(schedule.status).toBe('PENDING_APPROVAL');
  });
});

describe('RecurringBookingSchedule.reject and expire', () => {
  it('reject cancels with APPROVAL_REJECTED, clears the hold and fires Rejected', () => {
    const schedule = pendingSchedule();

    schedule.reject(CORRELATION_ID);

    expect(schedule.status).toBe('CANCELLED');
    expect(schedule.cancellationReason).toBe('APPROVAL_REJECTED');
    expect(schedule.approvalHoldExpiresAt).toBeNull();
    const events = schedule.domainEvents;
    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(RecurringBookingScheduleRejected);
    expect((events[0] as RecurringBookingScheduleRejected).data.reason).toBe('APPROVAL_REJECTED');
  });

  it('expire cancels with APPROVAL_EXPIRED and fires Rejected carrying that reason', () => {
    const schedule = pendingSchedule();

    schedule.expire(CORRELATION_ID);

    expect(schedule.status).toBe('CANCELLED');
    expect(schedule.cancellationReason).toBe('APPROVAL_EXPIRED');
    expect(schedule.approvalHoldExpiresAt).toBeNull();
    expect((schedule.domainEvents[0] as RecurringBookingScheduleRejected).data.reason).toBe(
      'APPROVAL_EXPIRED',
    );
  });

  it('refuse a schedule that is not pending', () => {
    const schedule = RecurringBookingSchedule.request(requestOptions());

    expect(() => schedule.reject(CORRELATION_ID)).toThrow(
      RecurringBookingScheduleNotPendingApprovalError,
    );
    expect(() => schedule.expire(CORRELATION_ID)).toThrow(
      RecurringBookingScheduleNotPendingApprovalError,
    );
  });
});

describe('RecurringBookingSchedule.markEnded', () => {
  it('moves an ACTIVE schedule to ENDED without raising an event', () => {
    const schedule = RecurringBookingSchedule.request(requestOptions());
    schedule.clearDomainEvents();

    schedule.markEnded();

    expect(schedule.status).toBe('ENDED');
    expect(schedule.domainEvents).toHaveLength(0);
  });

  it('refuses a schedule that is not ACTIVE', () => {
    expect(() => pendingSchedule().markEnded()).toThrow(RecurringBookingScheduleNotActiveError);
  });
});
