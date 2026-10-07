import type {
  AvailabilityAlertCriteriaType,
  AvailabilityAlertWeekday,
  CreateAvailabilityAlertRequest,
} from '@ikaro/types';
import type { AvailabilityAlertParams } from './availability-alert-link';
import { wallTimeToOffsetIso } from './zoned-time';

// Monday first — the order the weekday chips are drawn in (Seg … Dom).
export const ALERT_WEEKDAYS: readonly AvailabilityAlertWeekday[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

// How long the alert stays active. The backend defaults to 30 days and caps at 365
// (ALERT_DEFAULT_EXPIRY_DAYS / ALERT_MAX_EXPIRY_DAYS), clamping to the range end for a one-time range.
export const ALERT_EXPIRY_DAYS_OPTIONS = [30, 60, 90, 180, 365] as const;
export const ALERT_DEFAULT_EXPIRY_DAYS = 30;

const DAY_MS = 86_400_000;

export interface AvailabilityAlertFormState {
  readonly criteriaType: AvailabilityAlertCriteriaType;
  // <input type="datetime-local"> values: wall-clock time in the TENANT's timezone.
  readonly rangeFrom: string;
  readonly rangeTo: string;
  readonly weekdays: readonly AvailabilityAlertWeekday[];
  // <input type="time"> values, "HH:MM".
  readonly weeklyFrom: string;
  readonly weeklyTo: string;
  readonly expiryDays: number;
}

export type AvailabilityAlertFieldKey =
  'rangeFrom' | 'rangeTo' | 'weekdays' | 'weeklyFrom' | 'weeklyTo';

// One key per user-facing message (booking.availabilityAlert.errors.*). These mirror the
// backend's criteria rules (availability-alert-criteria.helpers.ts), checked up front so the
// customer sees the problem on the field instead of after a round-trip. The server stays
// authoritative — a 422 BOOKING_ALERT_CRITERIA_INVALID is still handled by the form.
export type AvailabilityAlertErrorKey =
  | 'rangeFromRequired'
  | 'rangeFromInvalid'
  | 'rangeToRequired'
  | 'rangeToInvalid'
  | 'rangeEnd'
  | 'rangePast'
  | 'weekdaysEmpty'
  | 'weeklyFromRequired'
  | 'weeklyToRequired'
  | 'weeklyEnd';

export type AvailabilityAlertFormErrors = Partial<
  Record<AvailabilityAlertFieldKey, AvailabilityAlertErrorKey>
>;

export const initialAvailabilityAlertForm: AvailabilityAlertFormState = {
  criteriaType: 'ONE_TIME_RANGE',
  rangeFrom: '',
  rangeTo: '',
  weekdays: [],
  weeklyFrom: '09:00',
  weeklyTo: '12:00',
  expiryDays: ALERT_DEFAULT_EXPIRY_DAYS,
};

function validateRange(
  state: AvailabilityAlertFormState,
  timeZone: string,
  now: Date,
): AvailabilityAlertFormErrors {
  if (!state.rangeFrom) return { rangeFrom: 'rangeFromRequired' };
  const from = wallTimeToOffsetIso(state.rangeFrom, timeZone);
  if (!from) return { rangeFrom: 'rangeFromInvalid' };
  if (!state.rangeTo) return { rangeTo: 'rangeToRequired' };
  const to = wallTimeToOffsetIso(state.rangeTo, timeZone);
  if (!to) return { rangeTo: 'rangeToInvalid' };
  if (new Date(to).getTime() <= new Date(from).getTime()) return { rangeTo: 'rangeEnd' };
  if (new Date(to).getTime() <= now.getTime()) return { rangeTo: 'rangePast' };
  return {};
}

function validateWeekly(state: AvailabilityAlertFormState): AvailabilityAlertFormErrors {
  const errors: AvailabilityAlertFormErrors = {};
  if (state.weekdays.length === 0) errors.weekdays = 'weekdaysEmpty';
  if (!state.weeklyFrom) errors.weeklyFrom = 'weeklyFromRequired';
  else if (!state.weeklyTo) errors.weeklyTo = 'weeklyToRequired';
  // "HH:MM" strings of the same width compare correctly as text.
  else if (state.weeklyTo <= state.weeklyFrom) errors.weeklyTo = 'weeklyEnd';
  return errors;
}

export function validateAvailabilityAlertForm(
  state: AvailabilityAlertFormState,
  timeZone: string,
  now: Date,
): AvailabilityAlertFormErrors {
  return state.criteriaType === 'ONE_TIME_RANGE'
    ? validateRange(state, timeZone, now)
    : validateWeekly(state);
}

// The POST /availability-alerts body. Only call it for a form that validated cleanly. The
// participant count is never sent (matching ignores it); `preferredResourceId` and
// `durationMinutes` come from the booking flow's link, never from a field the customer edits.
export function buildAvailabilityAlertRequest(
  state: AvailabilityAlertFormState,
  params: AvailabilityAlertParams & { readonly serviceId: string },
  timeZone: string,
  now: Date,
): CreateAvailabilityAlertRequest {
  const common = {
    serviceId: params.serviceId,
    ...(params.preferredResourceId ? { preferredResourceId: params.preferredResourceId } : {}),
    ...(params.durationMinutes ? { durationMinutes: params.durationMinutes } : {}),
    ...(state.expiryDays === ALERT_DEFAULT_EXPIRY_DAYS
      ? {}
      : { expiresAt: new Date(now.getTime() + state.expiryDays * DAY_MS).toISOString() }),
  };

  if (state.criteriaType === 'ONE_TIME_RANGE') {
    return {
      ...common,
      criteriaType: 'ONE_TIME_RANGE',
      acceptableStartAt: wallTimeToOffsetIso(state.rangeFrom, timeZone) ?? undefined,
      acceptableEndAt: wallTimeToOffsetIso(state.rangeTo, timeZone) ?? undefined,
    };
  }
  return {
    ...common,
    criteriaType: 'WEEKLY_PREFERENCE',
    weekdays: ALERT_WEEKDAYS.filter((day) => state.weekdays.includes(day)),
    localStartTime: state.weeklyFrom,
    localEndTime: state.weeklyTo,
  };
}
