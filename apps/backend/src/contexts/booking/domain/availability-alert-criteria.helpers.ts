import { TimeOfDay } from '../../../shared/value-objects/time-of-day.vo';
import {
  AvailabilityAlertCriteria,
  AvailabilityAlertCriteriaInput,
  AvailabilityAlertCriteriaPatch,
} from './availability-alert.types';
import {
  AvailabilityAlertCriteriaInvalidError,
  AvailabilityAlertCriteriaInvalidReason,
} from './errors/availability-alert.error';

const DAY_MS = 86_400_000;

// Locked at M23-S06's /story-discovery (2026-10-05): an alert lives 30 days unless the customer
// asks for another expiry, and never more than 90 days after it was created.
export const ALERT_DEFAULT_EXPIRY_DAYS = 30;
export const ALERT_MAX_EXPIRY_DAYS = 90;
export const ALERT_ACTIVE_CAP_PER_CUSTOMER = 10;

function invalid(
  reason: AvailabilityAlertCriteriaInvalidReason,
  field?: string,
): AvailabilityAlertCriteriaInvalidError {
  return new AvailabilityAlertCriteriaInvalidError(reason, field);
}

// Exactly one criteria representation: the other type's fields must be absent, not merely ignored.
export function buildCriteria(
  input: AvailabilityAlertCriteriaInput,
  now: Date,
): AvailabilityAlertCriteria {
  const hasRangeFields = input.acceptableStartAt != null || input.acceptableEndAt != null;
  const hasWeeklyFields =
    input.weekdays != null || input.localStartTime != null || input.localEndTime != null;

  if (input.criteriaType === 'ONE_TIME_RANGE') {
    if (hasWeeklyFields || !input.acceptableStartAt || !input.acceptableEndAt) {
      throw invalid('criteria-fields-mismatch');
    }
    if (input.acceptableEndAt <= input.acceptableStartAt) {
      throw invalid('range-end-before-start', 'acceptableEndAt');
    }
    if (input.acceptableEndAt <= now) throw invalid('range-in-past', 'acceptableEndAt');
    return {
      criteriaType: 'ONE_TIME_RANGE',
      acceptableStartAt: input.acceptableStartAt,
      acceptableEndAt: input.acceptableEndAt,
    };
  }

  if (hasRangeFields || !input.localStartTime || !input.localEndTime) {
    throw invalid('criteria-fields-mismatch');
  }
  const weekdays = [...new Set(input.weekdays ?? [])];
  if (weekdays.length === 0) throw invalid('weekdays-empty', 'weekdays');
  const localStartTime = TimeOfDay.create(input.localStartTime);
  const localEndTime = TimeOfDay.create(input.localEndTime);
  if (!localStartTime.isBefore(localEndTime)) {
    throw invalid('weekly-end-before-start', 'localEndTime');
  }
  return { criteriaType: 'WEEKLY_PREFERENCE', weekdays, localStartTime, localEndTime };
}

function criteriaToInput(criteria: AvailabilityAlertCriteria): AvailabilityAlertCriteriaInput {
  return criteria.criteriaType === 'ONE_TIME_RANGE'
    ? { ...criteria }
    : {
        criteriaType: 'WEEKLY_PREFERENCE',
        weekdays: [...criteria.weekdays],
        localStartTime: criteria.localStartTime.value,
        localEndTime: criteria.localEndTime.value,
      };
}

// Same type → overlay the present fields on the current values; a different type → only what the
// patch carries, so the new type's full set must be supplied and nothing of the old one survives.
export function mergeCriteriaPatch(
  current: AvailabilityAlertCriteria,
  patch: AvailabilityAlertCriteriaPatch,
): AvailabilityAlertCriteriaInput {
  const criteriaType = patch.criteriaType ?? current.criteriaType;
  const base = criteriaType === current.criteriaType ? criteriaToInput(current) : { criteriaType };
  const defined = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  );
  return { ...base, ...defined, criteriaType };
}

export interface ResolveExpiryInput {
  criteria: AvailabilityAlertCriteria;
  requested: Date | null;
  // The alert's current expiry — kept when no new one is requested (null on create).
  current: Date | null;
  // The maximum lifetime counts from creation: `now` on create, createdAt on update.
  anchor: Date;
  now: Date;
}

// A requested expiry must be in the future and within the maximum lifetime; for a one-time range
// it is then clamped to the range's end (an alert for a window that has passed is pointless).
export function resolveExpiry(input: ResolveExpiryInput): Date {
  const { criteria, requested, current, anchor, now } = input;
  if (requested) {
    if (requested <= now) throw invalid('expires-in-past', 'expiresAt');
    if (requested.getTime() > anchor.getTime() + ALERT_MAX_EXPIRY_DAYS * DAY_MS) {
      throw invalid('expires-beyond-max', 'expiresAt');
    }
  }
  const chosen =
    requested ?? current ?? new Date(anchor.getTime() + ALERT_DEFAULT_EXPIRY_DAYS * DAY_MS);
  return criteria.criteriaType === 'ONE_TIME_RANGE' && criteria.acceptableEndAt < chosen
    ? criteria.acceptableEndAt
    : chosen;
}
