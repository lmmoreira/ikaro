import { WeekDayName } from '../../../../shared/utils/calendar-date';
import {
  AvailabilityAlert,
  AvailabilityAlertCriteriaPatch,
  AvailabilityAlertCriteriaType,
} from '../../domain/availability-alert.aggregate';
import { AvailabilityAlertCriteriaInvalidError } from '../../domain/errors/availability-alert.error';
import { Resource } from '../../domain/resource.aggregate';
import { Service } from '../../domain/service.aggregate';
import { isInResourcePool } from './resource-pool.helpers';

// The criteria fields exactly as they arrive over HTTP (instants as ISO strings, validated by the
// shared zod schema in @ikaro/validation).
export interface AvailabilityAlertCriteriaFields {
  criteriaType?: AvailabilityAlertCriteriaType;
  acceptableStartAt?: string;
  acceptableEndAt?: string;
  weekdays?: WeekDayName[];
  localStartTime?: string;
  localEndTime?: string;
}

// Only the keys the caller actually sent are carried, so a PATCH overlays them on the alert's
// current values and an absent key keeps the current one.
export function toCriteriaPatch(
  fields: AvailabilityAlertCriteriaFields,
): AvailabilityAlertCriteriaPatch {
  return {
    ...(fields.criteriaType !== undefined && { criteriaType: fields.criteriaType }),
    ...(fields.acceptableStartAt !== undefined && {
      acceptableStartAt: new Date(fields.acceptableStartAt),
    }),
    ...(fields.acceptableEndAt !== undefined && {
      acceptableEndAt: new Date(fields.acceptableEndAt),
    }),
    ...(fields.weekdays !== undefined && { weekdays: fields.weekdays }),
    ...(fields.localStartTime !== undefined && { localStartTime: fields.localStartTime }),
    ...(fields.localEndTime !== undefined && { localEndTime: fields.localEndTime }),
  };
}

export function hasCriteriaFields(fields: AvailabilityAlertCriteriaFields): boolean {
  return Object.keys(toCriteriaPatch(fields)).length > 0;
}

// An alert that names a preferred resource must be one that can actually serve the service: an
// active resource of a type one of the service's requirements (flat or in a leg) asks for, and
// inside that requirement's pool restriction. Otherwise the alert could never match.
export function assertPreferredResourceEligible(service: Service, resource: Resource | null): void {
  if (resource?.isActive) {
    const requirements = [
      ...service.resourceRequirements,
      ...(service.legs ?? []).flatMap((leg) => leg.resourceRequirements),
    ];
    const eligible = requirements.some(
      (requirement) =>
        requirement.type === resource.type &&
        isInResourcePool(requirement.resourcePoolIds, resource.id),
    );
    if (eligible) return;
  }
  throw new AvailabilityAlertCriteriaInvalidError('resource-not-eligible', 'preferredResourceId');
}

export interface AvailabilityAlertResult {
  id: string;
  serviceId: string;
  preferredResourceId: string | null;
  criteriaType: AvailabilityAlertCriteriaType;
  timezone: string;
  acceptableStartAt: string | null;
  acceptableEndAt: string | null;
  weekdays: WeekDayName[] | null;
  localStartTime: string | null;
  localEndTime: string | null;
  durationMinutes: number | null;
  participantCount: number | null;
  status: 'ACTIVE' | 'NOTIFIED' | 'CANCELLED' | 'EXPIRED';
  expiresAt: string;
  createdAt: string;
}

export function toAvailabilityAlertResult(alert: AvailabilityAlert): AvailabilityAlertResult {
  const criteria = alert.criteria;
  const isRange = criteria.criteriaType === 'ONE_TIME_RANGE';
  return {
    id: alert.id,
    serviceId: alert.serviceId,
    preferredResourceId: alert.preferredResourceId,
    criteriaType: criteria.criteriaType,
    timezone: alert.timezone,
    acceptableStartAt: isRange ? criteria.acceptableStartAt.toISOString() : null,
    acceptableEndAt: isRange ? criteria.acceptableEndAt.toISOString() : null,
    weekdays: isRange ? null : criteria.weekdays,
    localStartTime: isRange ? null : criteria.localStartTime.value,
    localEndTime: isRange ? null : criteria.localEndTime.value,
    durationMinutes: alert.durationMinutes,
    participantCount: alert.participantCount,
    status: alert.status,
    expiresAt: alert.expiresAt.toISOString(),
    createdAt: alert.createdAt.toISOString(),
  };
}
