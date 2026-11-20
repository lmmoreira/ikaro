import { DateTime } from 'luxon';
import {
  addDaysUTC,
  getUtcWeekDayName,
  localDateStartUTC,
  utcDateToLocalDate,
} from '../../../shared/utils/calendar-date';
import type { Timezone } from '../../../shared/value-objects/timezone.vo';
import {
  PAYMENT_PENDING_MARGIN_BUSINESS_DAYS,
  PAYMENT_SETTLEMENT_MARGIN_HOURS,
} from './billing-constants';
import { GRACE_DAYS } from './subscription.types';

const HOUR_MS = 3_600_000;

/**
 * The date `days` business days after `date` (a `YYYY-MM-DD`): Monday to Friday of the calendar the
 * date is in, no holiday calendar. Counting starts the day after `date`, so a Friday plus one is the
 * following Monday.
 */
export function addBusinessDays(date: string, days: number): string {
  let current = date;
  let remaining = days;
  while (remaining > 0) {
    current = addDaysUTC(current, 1);
    const weekDay = getUtcWeekDayName(current);
    if (weekDay !== 'saturday' && weekDay !== 'sunday') remaining -= 1;
  }
  return current;
}

/**
 * The instant after which an unpaid trial is suspended (UC-115 rule 2): `PAYMENT_SETTLEMENT_MARGIN_HOURS`
 * after it ends, or, when the manager already returned from the payment page while the first charge
 * is still open, the start of the tenant-local day `PAYMENT_PENDING_MARGIN_BUSINESS_DAYS` business
 * days after the trial's last day. The hours are literal hours; the business days are calendar maths
 * on the local date, converted back through the zone, so a DST change never shifts a boundary.
 */
export function trialSettlementDeadline(
  trialEndsAt: Date,
  timezone: Timezone,
  paymentReturnSeen: boolean,
): Date {
  if (!paymentReturnSeen)
    return new Date(trialEndsAt.getTime() + PAYMENT_SETTLEMENT_MARGIN_HOURS * HOUR_MS);
  const endDate = utcDateToLocalDate(trialEndsAt, timezone.value);
  const deadlineDate = addBusinessDays(endDate, PAYMENT_PENDING_MARGIN_BUSINESS_DAYS);
  return localDateStartUTC(deadlineDate, timezone.value);
}

/**
 * The instant the grace of a `PAST_DUE` subscription ends (UC-115 rule 3): the operator's
 * `graceUntil` when one is set (it replaces the 14 days; `extendGrace` never accepts an earlier
 * one), otherwise `pastDueSince` plus 14 days.
 */
export function graceEndsAt(pastDueSince: Date, graceUntil: Date | null): Date {
  if (graceUntil !== null) return graceUntil;
  return DateTime.fromJSDate(pastDueSince, { zone: 'utc' }).plus({ days: GRACE_DAYS }).toJSDate();
}
