import {
  getUtcWeekDayName,
  utcDateToLocalDate,
  utcDateToLocalHHMM,
} from '../../../shared/utils/calendar-date';
import {
  AvailabilityAlertCriteria,
  AvailabilityAlertMatchingWindow,
} from './availability-alert.types';

// UC-072 step 3 (M23-S07): does a bookable slot satisfy an alert's criteria? A slot is a half-open
// [startsAt, endsAt) UTC interval already known to be bookable for the alert's service. What the
// customer states is when they can *start* ("between 10:00 and 12:00", "Mondays after 18:00"), so
// the slot's start is what is compared — its end is the availability engine's own (it includes the
// service buffer, which is no concern of the customer's window).
//
// - ONE_TIME_RANGE: acceptableStartAt <= slot start < acceptableEndAt.
// - WEEKLY_PREFERENCE: the slot's local start date (in the alert's timezone) falls on one of the
//   weekdays and its local start time is in [localStartTime, localEndTime).
export function slotMatchesCriteria(
  criteria: AvailabilityAlertCriteria,
  timezone: string,
  slot: AvailabilityAlertMatchingWindow,
): boolean {
  if (slot.endsAt <= slot.startsAt) return false;

  if (criteria.criteriaType === 'ONE_TIME_RANGE') {
    return slot.startsAt >= criteria.acceptableStartAt && slot.startsAt < criteria.acceptableEndAt;
  }

  const localDate = utcDateToLocalDate(slot.startsAt, timezone);
  if (!criteria.weekdays.includes(getUtcWeekDayName(localDate))) return false;

  const localStart = utcDateToLocalHHMM(slot.startsAt, timezone);
  return localStart >= criteria.localStartTime.value && localStart < criteria.localEndTime.value;
}

// The earliest slot (by start) that satisfies the criteria, or null. The caller records that slot as
// the alert's matching window.
export function findFirstMatchingSlot(
  criteria: AvailabilityAlertCriteria,
  timezone: string,
  slots: readonly AvailabilityAlertMatchingWindow[],
): AvailabilityAlertMatchingWindow | null {
  const sorted = [...slots].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return sorted.find((slot) => slotMatchesCriteria(criteria, timezone, slot)) ?? null;
}
