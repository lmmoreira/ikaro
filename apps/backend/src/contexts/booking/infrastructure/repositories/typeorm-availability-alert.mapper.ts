import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { TimeOfDay } from '../../../../shared/value-objects/time-of-day.vo';
import { Timezone } from '../../../../shared/value-objects/timezone.vo';
import { AvailabilityAlert } from '../../domain/availability-alert.aggregate';
import { AvailabilityAlertCriteria } from '../../domain/availability-alert.types';
import { AvailabilityAlertEntity } from '../entities/availability-alert.entity';

function toCriteria(entity: AvailabilityAlertEntity): AvailabilityAlertCriteria {
  if (entity.criteriaType === 'ONE_TIME_RANGE') {
    return {
      criteriaType: 'ONE_TIME_RANGE',
      acceptableStartAt: entity.acceptableStartAt as Date,
      acceptableEndAt: entity.acceptableEndAt as Date,
    };
  }
  return {
    criteriaType: 'WEEKLY_PREFERENCE',
    weekdays: entity.weekdays ?? [],
    localStartTime: TimeOfDay.create(entity.localStartTime as string),
    localEndTime: TimeOfDay.create(entity.localEndTime as string),
  };
}

export function toDomain(entity: AvailabilityAlertEntity): AvailabilityAlert {
  return AvailabilityAlert.reconstitute({
    id: entity.id,
    tenantId: entity.tenantId,
    serviceId: entity.serviceId,
    customerId: entity.customerId,
    preferredResourceId: entity.preferredResourceId,
    timezone: Timezone.create(entity.timezone),
    criteria: toCriteria(entity),
    durationMinutes: entity.durationMinutes,
    participantCount: entity.participantCount,
    status: entity.status,
    expiresAt: entity.expiresAt,
    createdAt: entity.createdAt,
    version: entity.version,
  });
}

export function toEntity(alert: AvailabilityAlert): AvailabilityAlertEntity {
  const criteria = alert.criteria;
  const entity = new AvailabilityAlertEntity();
  entity.id = alert.id;
  entity.tenantId = alert.tenantId;
  entity.serviceId = alert.serviceId;
  entity.customerId = alert.customerId;
  entity.preferredResourceId = alert.preferredResourceId;
  entity.criteriaType = criteria.criteriaType;
  entity.timezone = alert.timezone;
  // The columns of the criteria type not in use are written as null explicitly, so a PATCH that
  // switches the type clears the old representation (the DB CHECK demands exactly one).
  if (criteria.criteriaType === 'ONE_TIME_RANGE') {
    entity.acceptableStartAt = criteria.acceptableStartAt;
    entity.acceptableEndAt = criteria.acceptableEndAt;
    entity.weekdays = null;
    entity.localStartTime = null;
    entity.localEndTime = null;
  } else {
    entity.acceptableStartAt = null;
    entity.acceptableEndAt = null;
    entity.weekdays = criteria.weekdays;
    entity.localStartTime = criteria.localStartTime.value;
    entity.localEndTime = criteria.localEndTime.value;
  }
  entity.durationMinutes = alert.durationMinutes;
  entity.participantCount = alert.participantCount;
  entity.status = alert.status;
  entity.expiresAt = alert.expiresAt;
  entity.createdAt = alert.createdAt;
  // Left unset for a brand-new alert so the DB default (1) applies on INSERT.
  if (alert.version !== undefined) entity.version = alert.version;
  return entity;
}

// Fields safe to overwrite on an UPDATE — excludes id/tenantId (immutable identity) and
// createdAt/version (version is bumped via its own raw SQL literal).
export function toUpdateSet(
  entity: AvailabilityAlertEntity,
): QueryDeepPartialEntity<AvailabilityAlertEntity> {
  const updatable = Object.fromEntries(
    Object.entries(entity).filter(
      ([key]) => !['id', 'tenantId', 'createdAt', 'version'].includes(key),
    ),
  ) as QueryDeepPartialEntity<AvailabilityAlertEntity>;
  return { ...updatable, version: () => '"version" + 1' };
}
