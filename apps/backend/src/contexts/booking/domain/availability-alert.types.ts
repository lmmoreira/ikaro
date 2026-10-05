import { WeekDayName } from '../../../shared/utils/calendar-date';
import { TimeOfDay } from '../../../shared/value-objects/time-of-day.vo';
import { Timezone } from '../../../shared/value-objects/timezone.vo';

// docs/02-DOMAIN_MODEL.md § AvailabilityAlert — an expiring, non-reserving intent.
export type AvailabilityAlertCriteriaType = 'ONE_TIME_RANGE' | 'WEEKLY_PREFERENCE';
export type AvailabilityAlertStatus = 'ACTIVE' | 'NOTIFIED' | 'CANCELLED' | 'EXPIRED';

// docs/13-DATABASE_SCHEMA.md § availability_alert_notification_attempts. EMAIL is the only channel
// M23-S07 writes (the CHECK also allows IN_APP). PENDING means "a match was found and handed off to
// the Notification context" — a later story updates the outcome once the message is really sent.
export type AvailabilityAlertAttemptChannel = 'EMAIL' | 'IN_APP';
export type AvailabilityAlertAttemptOutcome = 'PENDING';

// The slot that satisfied the alert — a half-open [startsAt, endsAt) UTC interval, stored as the
// attempt's `matching_window` and the deduplication key together with the channel.
export interface AvailabilityAlertMatchingWindow {
  startsAt: Date;
  endsAt: Date;
}

export interface AvailabilityAlertNotificationAttempt {
  id: string;
  tenantId: string;
  alertId: string;
  matchingWindow: AvailabilityAlertMatchingWindow;
  channel: AvailabilityAlertAttemptChannel;
  outcome: AvailabilityAlertAttemptOutcome;
  attemptedAt: Date;
}

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
