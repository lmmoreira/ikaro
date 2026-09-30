import {
  RecurringBookingScheduleEntityBuilder,
  RecurringBookingScheduleResourceAssignmentEntityBuilder,
} from '../../../../test/builders/booking/index';
import {
  toDomain,
  toEntity,
  toResourceAssignmentEntities,
} from './typeorm-recurring-booking-schedule.mapper';

describe('typeorm-recurring-booking-schedule.mapper', () => {
  it('round-trips a schedule with a resource assignment through toDomain/toEntity', () => {
    const entity = new RecurringBookingScheduleEntityBuilder()
      .withStatus('ACTIVE')
      .withAssignmentPolicy('FIXED_ASSIGNMENT')
      .build();
    const assignmentEntity = new RecurringBookingScheduleResourceAssignmentEntityBuilder()
      .withTenantId(entity.tenantId)
      .withRecurringScheduleId(entity.id)
      .build();

    const schedule = toDomain(entity, [assignmentEntity]);

    expect(schedule.id).toBe(entity.id);
    expect(schedule.tenantId).toBe(entity.tenantId);
    expect(schedule.customerId).toBe(entity.customerId);
    expect(schedule.serviceId).toBe(entity.serviceId);
    expect(schedule.recurrence).toEqual(entity.recurrence);
    expect(schedule.startsOn).toBe(entity.startsOn);
    expect(schedule.endsOn).toBe(entity.endsOn);
    expect(schedule.status).toBe('ACTIVE');
    expect(schedule.assignmentPolicy).toBe('FIXED_ASSIGNMENT');
    expect(schedule.resourceAssignments).toEqual([
      {
        resourceId: assignmentEntity.resourceId,
        resourceType: assignmentEntity.resourceType,
        requirementId: assignmentEntity.requirementId,
        requiredQuantityPosition: assignmentEntity.requiredQuantityPosition,
        assignedAt: assignmentEntity.assignedAt,
      },
    ]);
    expect(schedule.approvalHoldExpiresAt).toBe(entity.approvalHoldExpiresAt);
    expect(schedule.approvedByStaffId).toBe(entity.approvedByStaffId);
    expect(schedule.approvedAt).toBe(entity.approvedAt);
    expect(schedule.cancellationReason).toBe(entity.cancellationReason);
    expect(schedule.createdByStaffId).toBe(entity.createdByStaffId);
    expect(schedule.createdAt).toBe(entity.createdAt);
    expect(schedule.updatedAt).toBe(entity.updatedAt);

    const roundTripped = toEntity(schedule);
    expect(roundTripped).toMatchObject({
      id: entity.id,
      tenantId: entity.tenantId,
      customerId: entity.customerId,
      serviceId: entity.serviceId,
      recurrence: entity.recurrence,
      startsOn: entity.startsOn,
      endsOn: entity.endsOn,
      status: entity.status,
      assignmentPolicy: entity.assignmentPolicy,
    });

    const assignmentEntities = toResourceAssignmentEntities(schedule);
    expect(assignmentEntities).toHaveLength(1);
    expect(assignmentEntities[0]).toMatchObject({
      tenantId: schedule.tenantId,
      recurringScheduleId: schedule.id,
      resourceId: assignmentEntity.resourceId,
    });
  });

  it('maps a schedule with no assignments', () => {
    const entity = new RecurringBookingScheduleEntityBuilder()
      .withAssignmentPolicy('RESOLVE_PER_OCCURRENCE')
      .build();

    const schedule = toDomain(entity, []);

    expect(schedule.resourceAssignments).toEqual([]);
    expect(toResourceAssignmentEntities(schedule)).toEqual([]);
  });
});
