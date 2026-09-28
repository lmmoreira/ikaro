import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { TimeOfDay } from '../../../../shared/value-objects/time-of-day.vo';
import { RecurrenceRule } from '../../domain/recurrence-rule.helpers';
import {
  RecurringBookingSchedule,
  RecurringBookingScheduleExceptionProps,
  RecurringBookingScheduleResourceAssignmentProps,
} from '../../domain/recurring-booking-schedule.aggregate';
import { RecurringBookingScheduleEntity } from '../entities/recurring-booking-schedule.entity';
import { RecurringBookingScheduleExceptionEntity } from '../entities/recurring-booking-schedule-exception.entity';
import { RecurringBookingScheduleResourceAssignmentEntity } from '../entities/recurring-booking-schedule-resource-assignment.entity';

export function toDomain(
  entity: RecurringBookingScheduleEntity,
  assignmentEntities: RecurringBookingScheduleResourceAssignmentEntity[],
  exceptionEntities: RecurringBookingScheduleExceptionEntity[],
): RecurringBookingSchedule {
  return RecurringBookingSchedule.reconstitute({
    id: entity.id,
    tenantId: entity.tenantId,
    customerId: entity.customerId,
    serviceId: entity.serviceId,
    recurrence: {
      ...(entity.recurrence as RecurrenceRule),
      startTime: TimeOfDay.create((entity.recurrence as RecurrenceRule).startTime),
    },
    startsOn: entity.startsOn,
    endsOn: entity.endsOn,
    status: entity.status,
    assignmentPolicy: entity.assignmentPolicy,
    resourceAssignments: assignmentEntities.map(toResourceAssignmentProps),
    exceptions: exceptionEntities.map(toExceptionProps),
    approvalHoldExpiresAt: entity.approvalHoldExpiresAt,
    approvedByStaffId: entity.approvedByStaffId,
    approvedAt: entity.approvedAt,
    cancellationReason: entity.cancellationReason,
    createdByStaffId: entity.createdByStaffId,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    version: entity.version,
  });
}

function toResourceAssignmentProps(
  entity: RecurringBookingScheduleResourceAssignmentEntity,
): RecurringBookingScheduleResourceAssignmentProps {
  return {
    resourceId: entity.resourceId,
    resourceType: entity.resourceType,
    requirementId: entity.requirementId,
    requiredQuantityPosition: entity.requiredQuantityPosition,
    assignedAt: entity.assignedAt,
  };
}

function toExceptionProps(
  entity: RecurringBookingScheduleExceptionEntity,
): RecurringBookingScheduleExceptionProps {
  return {
    id: entity.id,
    occurrenceStart: entity.occurrenceStart,
    kind: entity.kind,
    replacementBookingId: entity.replacementBookingId,
    actorType: entity.actorType,
    actorId: entity.actorId,
    reason: entity.reason,
    createdAt: entity.createdAt,
  };
}

export function toEntity(schedule: RecurringBookingSchedule): RecurringBookingScheduleEntity {
  const entity = new RecurringBookingScheduleEntity();
  entity.id = schedule.id;
  entity.tenantId = schedule.tenantId;
  entity.customerId = schedule.customerId;
  entity.serviceId = schedule.serviceId;
  entity.recurrence = schedule.recurrence;
  entity.startsOn = schedule.startsOn;
  entity.endsOn = schedule.endsOn;
  entity.status = schedule.status;
  entity.assignmentPolicy = schedule.assignmentPolicy;
  entity.approvalHoldExpiresAt = schedule.approvalHoldExpiresAt;
  entity.approvedByStaffId = schedule.approvedByStaffId;
  entity.approvedAt = schedule.approvedAt;
  entity.cancellationReason = schedule.cancellationReason;
  entity.createdByStaffId = schedule.createdByStaffId;
  entity.createdAt = schedule.createdAt;
  entity.updatedAt = schedule.updatedAt;
  // Left unset (undefined) for a brand-new schedule so the DB default (1) applies on INSERT —
  // set only once the schedule has actually been persisted (mirrors typeorm-booking.mapper.ts's
  // own toEntity() precedent for the same optimistic-concurrency shape).
  if (schedule.version !== undefined) entity.version = schedule.version;
  return entity;
}

// Fields safe to overwrite on an UPDATE — excludes id/tenantId (immutable identity) and
// createdAt/version (version is bumped via its own raw SQL literal below), matching
// typeorm-booking.mapper.ts's toUpdateSet() precedent exactly.
export function toUpdateSet(
  entity: RecurringBookingScheduleEntity,
): QueryDeepPartialEntity<RecurringBookingScheduleEntity> {
  const updatable = Object.fromEntries(
    Object.entries(entity).filter(
      ([key]) => !['id', 'tenantId', 'createdAt', 'version'].includes(key),
    ),
  ) as QueryDeepPartialEntity<RecurringBookingScheduleEntity>;
  return { ...updatable, version: () => '"version" + 1' };
}

export function toResourceAssignmentEntities(
  schedule: RecurringBookingSchedule,
): RecurringBookingScheduleResourceAssignmentEntity[] {
  return schedule.resourceAssignments.map((a) => {
    const entity = new RecurringBookingScheduleResourceAssignmentEntity();
    entity.tenantId = schedule.tenantId;
    entity.recurringScheduleId = schedule.id;
    entity.resourceId = a.resourceId;
    entity.resourceType = a.resourceType;
    entity.requirementId = a.requirementId;
    entity.requiredQuantityPosition = a.requiredQuantityPosition;
    entity.assignedAt = a.assignedAt;
    return entity;
  });
}

export function toExceptionEntities(
  schedule: RecurringBookingSchedule,
  exceptions: RecurringBookingScheduleExceptionProps[],
): RecurringBookingScheduleExceptionEntity[] {
  return exceptions.map((e) => {
    const entity = new RecurringBookingScheduleExceptionEntity();
    entity.id = e.id;
    entity.tenantId = schedule.tenantId;
    entity.recurringScheduleId = schedule.id;
    entity.occurrenceStart = e.occurrenceStart;
    entity.kind = e.kind;
    entity.replacementBookingId = e.replacementBookingId;
    entity.actorType = e.actorType;
    entity.actorId = e.actorId;
    entity.reason = e.reason;
    entity.createdAt = e.createdAt;
    return entity;
  });
}
