import { DateTime } from 'luxon';
import {
  addDaysUTC,
  localDateEndUTC,
  utcDateToLocalDate,
} from '../../../shared/utils/calendar-date';
import { CalendarDate } from '../../../shared/value-objects/calendar-date.vo';
import type { Timezone } from '../../../shared/value-objects/timezone.vo';
import { ANCHOR_DAY_MAX } from './subscription.types';

export interface RecoveryPaymentWindow {
  /** The renewal anchor: the payment's tenant-local day of the month, clamped to 28. */
  anchorDay: number;
  /** The last instant of the paid month (the end of its tenant-local last day). */
  periodEnd: Date;
  /** The day the next invoice falls due: the day after `periodEnd`. */
  nextDueDate: CalendarDate;
}

/**
 * The month a recovery payment buys, in the subscription's snapshot zone: it starts at the payment
 * moment, renews on the payment's own tenant-local day (clamped to 28, so the 29th-31st never need
 * special handling) and ends the day before the next anchor. Calendar maths on the local date, so a
 * DST change inside the month never shifts a boundary.
 */
export function recoveryPaymentWindow(paidAt: Date, timezone: Timezone): RecoveryPaymentWindow {
  const paidLocal = utcDateToLocalDate(paidAt, timezone.value);
  const anchorDay = Math.min(Number(paidLocal.slice(8, 10)), ANCHOR_DAY_MAX);
  const nextDue = DateTime.fromISO(paidLocal, { zone: 'utc' })
    .plus({ months: 1 })
    .set({ day: anchorDay })
    .toISODate()!;
  return {
    anchorDay,
    periodEnd: localDateEndUTC(addDaysUTC(nextDue, -1), timezone.value),
    nextDueDate: CalendarDate.reconstitute(nextDue),
  };
}
