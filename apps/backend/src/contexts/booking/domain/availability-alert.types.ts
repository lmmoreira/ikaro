import { WeekDayName } from '../../../shared/utils/calendar-date';
import { TimeOfDay } from '../../../shared/value-objects/time-of-day.vo';
import { Timezone } from '../../../shared/value-objects/timezone.vo';

// docs/02-DOMAIN_MODEL.md § AvailabilityAlert — an expiring, non-reserving intent.
export type AvailabilityAlertCriteriaType = 'ONE_TIME_RANGE' | 'WEEKLY_PREFERENCE';
export type AvailabilityAlertStatus = 'ACTIVE' | 'NOTIFIED' | 'CANCELLED' | 'EXPIRED';

// Exactly one criteria representation (the domain invariant, also a DB CHECK): a finite absolute
// range, or a weekly local-time preference interpreted in the alert's own timezone.
export type AvailabilityAlertCriteria =
  | { criteriaType: 'ONE_TIME_RANGE'; acceptableStartAt: Date; acceptableEndAt: Date }
  | {
      criteriaType: 'WEEKLY_PREFERENCE';
      weekdays: WeekDayName[];
      localStartTime: TimeOfDay;
      localEndTime: TimeOfDay;
    };

// The raw, not-yet-validated shape an input (a request body, a PATCH merge) hands the aggregate.
export interface AvailabilityAlertCriteriaInput {
  criteriaType: AvailabilityAlertCriteriaType;
  acceptableStartAt?: Date | null;
  acceptableEndAt?: Date | null;
  weekdays?: WeekDayName[] | null;
  localStartTime?: string | null;
  localEndTime?: string | null;
}

export interface AvailabilityAlertProps {
  id: string;
  tenantId: string;
  serviceId: string;
  customerId: string;
  preferredResourceId: string | null;
  timezone: Timezone;
  criteria: AvailabilityAlertCriteria;
  durationMinutes: number | null;
  participantCount: number | null;
  status: AvailabilityAlertStatus;
  expiresAt: Date;
  createdAt: Date;
  // Optimistic-concurrency token — undefined for a brand-new, never-persisted aggregate.
  version?: number;
}

export interface CreateAvailabilityAlertOptions {
  tenantId: string;
  customerId: string;
  serviceId: string;
  preferredResourceId: string | null;
  // Always the tenant's timezone (taken from the request context, never client-supplied).
  timezone: string;
  criteria: AvailabilityAlertCriteriaInput;
  durationMinutes: number | null;
  participantCount: number | null;
  expiresAt: Date | null;
  correlationId: string;
  now?: Date;
}

// A PATCH's criteria fields: same type as the alert → the present fields overlay its current
// values; a different `criteriaType` → the patch must carry that type's full set (nothing is
// carried over), so a switch can never leave a mix of both representations.
export type AvailabilityAlertCriteriaPatch = Partial<AvailabilityAlertCriteriaInput>;

// Each key present replaces the alert's current value; absent keys keep it.
export interface UpdateAvailabilityAlertChanges {
  criteria?: AvailabilityAlertCriteriaPatch;
  preferredResourceId?: string | null;
  durationMinutes?: number | null;
  participantCount?: number | null;
  expiresAt?: Date;
}
