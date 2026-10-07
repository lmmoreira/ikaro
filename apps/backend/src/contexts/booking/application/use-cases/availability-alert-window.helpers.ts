import {
  addDaysUTC,
  todayInTimezone,
  utcDateToLocalDate,
} from '../../../../shared/utils/calendar-date';
import type { AvailabilityAlertTenantContext } from '../ports/booking-platform.port';
import type { BookingWindow } from './booking-window.helpers';

const MS_PER_HOUR = 3_600_000;

export interface AlertDatesArgs {
  around: Date | null;
  context: AvailabilityAlertTenantContext;
  window: BookingWindow;
  now: Date;
}

// The calendar days an alert run evaluates, clamped to [today, today + days − 1] where "today" is
// the tenant-local date — the same day the availability read and the public calendar use — and
// `days` is the tenant's selectable days narrowed to the service's own maximum. A freed booking
// contributes the tenant-local day it was on, which is the day its slot is listed under; if that
// day is already behind the window it is simply not selectable any more.
export function alertDatesToCheck(args: AlertDatesArgs): string[] {
  const { around, context, window, now } = args;
  const timezone = context.businessHours.timezone;
  const today = todayInTimezone(timezone, now);
  const lastDate = addDaysUTC(today, Math.min(context.selectableDays, window.maxAdvanceDays) - 1);

  if (around) {
    const date = utcDateToLocalDate(around, timezone);
    return date >= today && date <= lastDate ? [date] : [];
  }
  const dates: string[] = [];
  for (let date = today; date <= lastDate; date = addDaysUTC(date, 1)) dates.push(date);
  return dates;
}

// The earliest start (ms) booking would accept: after now, and past the service's minimum notice.
export function earliestBookableStartMs(now: Date, window: BookingWindow): number {
  return now.getTime() + window.minAdvanceHours * MS_PER_HOUR;
}
