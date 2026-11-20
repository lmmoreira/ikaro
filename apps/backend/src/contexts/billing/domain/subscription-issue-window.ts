import { DateTime } from 'luxon';
import { addDaysUTC } from '../../../shared/utils/calendar-date';
import { CalendarDate } from '../../../shared/value-objects/calendar-date.vo';

export interface IssuedPeriodWindow {
  /** The first day of the service period: the invoice's due date and `periodStart`. */
  periodStart: CalendarDate;
  /** The last day of the service period: the day before the next anchor. */
  periodEnd: CalendarDate;
  /** The due date of the period after this one, which `next_due_date` moves to. */
  nextDueDate: CalendarDate;
}

/**
 * The anchor day one month after `date` (a `YYYY-MM-DD`): the same day of the next month, set to the
 * anchor day. The anchor is at most 28, so every month has it; shared by the issue window and the
 * recovery payment window so the two can never step a month differently.
 */
export function nextAnchorDate(date: string, anchorDay: number): string {
  return DateTime.fromISO(date, { zone: 'utc' })
    .plus({ months: 1 })
    .set({ day: anchorDay })
    .toISODate()!;
}

/**
 * The service period the next invoice covers (UC-113 step 1): it starts on the subscription's
 * `next_due_date`, renews on the anchor day (at most 28, so every month has it) and ends the day
 * before the next anchor. Calendar maths on the tenant-local date, so a DST change never shifts a
 * boundary; the same arithmetic as `recoveryPaymentWindow`.
 */
export function issuedPeriodWindow(
  nextDueDate: CalendarDate,
  anchorDay: number,
): IssuedPeriodWindow {
  const following = nextAnchorDate(nextDueDate.value, anchorDay);
  return {
    periodStart: nextDueDate,
    periodEnd: CalendarDate.reconstitute(addDaysUTC(following, -1)),
    nextDueDate: CalendarDate.reconstitute(following),
  };
}
