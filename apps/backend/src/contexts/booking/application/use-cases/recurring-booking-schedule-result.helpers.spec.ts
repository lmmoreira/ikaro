import { RecurringBookingSchedule } from '../../domain/recurring-booking-schedule.aggregate';
import { ResourceType } from '../../domain/resource.types';
import { toRecurringBookingScheduleResult } from './recurring-booking-schedule-result.helpers';

function schedule(
  status: 'ACTIVE' | 'PENDING_APPROVAL',
  assignmentPolicy: 'FIXED_ASSIGNMENT' | 'RESOLVE_PER_OCCURRENCE' = 'FIXED_ASSIGNMENT',
): RecurringBookingSchedule {
  return RecurringBookingSchedule.request({
    tenantId: '10000000-0000-4000-8000-000000000401',
    customerId: 'customer-a',
    serviceId: 'service-1',
    recurrence: {
      frequency: 'WEEKLY',
      daysOfWeek: ['tuesday', 'thursday'],
      startTime: '10:00',
      durationMinutes: 120,
    },
    startsOn: '2026-09-01',
    endsOn: '2026-11-24',
    maxTermDays: 90,
    assignmentPolicy,
    resourceAssignments:
      assignmentPolicy === 'FIXED_ASSIGNMENT'
        ? [
            {
              resourceId: 'res-1',
              resourceType: ResourceType.ROOM,
              requirementId: null,
              requiredQuantityPosition: null,
            },
          ]
        : [],
    status,
    approvalHoldExpiresAt: status === 'PENDING_APPROVAL' ? new Date('2099-01-01T00:00:00Z') : null,
    createdByStaffId: null,
    correlationId: 'corr-1',
  });
}

describe('toRecurringBookingScheduleResult', () => {
  it('maps every field of the wire shape, including the service name', () => {
    const s = schedule('ACTIVE');

    expect(toRecurringBookingScheduleResult(s, 'Sala Aurora', true)).toEqual({
      id: s.id,
      customerId: 'customer-a',
      serviceId: 'service-1',
      serviceName: 'Sala Aurora',
      recurrence: {
        frequency: 'WEEKLY',
        daysOfWeek: ['tuesday', 'thursday'],
        startTime: '10:00',
        durationMinutes: 120,
      },
      startsOn: '2026-09-01',
      endsOn: '2026-11-24',
      status: 'ACTIVE',
      assignmentPolicy: 'FIXED_ASSIGNMENT',
      resourceIds: ['res-1'],
      resourceAssignments: [{ resourceType: ResourceType.ROOM, resourceId: 'res-1' }],
      approvalHoldExpiresAt: null,
      createdAt: s.createdAt.toISOString(),
      renewable: true,
    });
  });

  it('has no resource ids when the resource is resolved per occurrence', () => {
    const s = schedule('ACTIVE', 'RESOLVE_PER_OCCURRENCE');

    const result = toRecurringBookingScheduleResult(s, 'Sala Aurora', false);
    expect(result.resourceIds).toEqual([]);
    expect(result.resourceAssignments).toEqual([]);
  });

  it('serializes the approval-hold expiry as an ISO string for a pending schedule', () => {
    const result = toRecurringBookingScheduleResult(
      schedule('PENDING_APPROVAL'),
      'Sala Aurora',
      false,
    );

    expect(result.status).toBe('PENDING_APPROVAL');
    expect(result.approvalHoldExpiresAt).toBe('2099-01-01T00:00:00.000Z');
  });

  it('returns the creation time as an ISO-8601 UTC string, for any status', () => {
    const pending = schedule('PENDING_APPROVAL');

    const result = toRecurringBookingScheduleResult(pending, 'Sala Aurora', false);

    expect(result.createdAt).toBe(pending.createdAt.toISOString());
    expect(result.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });
});
