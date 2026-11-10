import {
  addDaysUTC,
  localDateStartUTC,
  utcDateToLocalDate,
} from '../../../shared/utils/calendar-date';
import { CalendarDate } from '../../../shared/value-objects/calendar-date.vo';
import type { CountryCode } from '../../../shared/value-objects/country-code.vo';
import type { Timezone } from '../../../shared/value-objects/timezone.vo';
import { SubscriptionInvariantError } from './errors/billing-domain.error';
import { ANCHOR_DAY_MAX, TRIAL_DAYS } from './subscription.types';

export interface TrialWindow {
  trialEndsAt: Date;
  nextDueDate: CalendarDate;
  anchorDay: number;
}

/**
 * The tenant-local midnight closing day 14 and the renewal anchor derived from it: the window opens
 * at the start of the local day of `start`, runs 14 calendar days, and `anchorDay` is the
 * day-of-month of that end, clamped to 28 (the rule S05's backfill SQL mirrors). Calendar maths on
 * the local date, converted back through the snapshot zone, so a DST change inside the window never
 * shifts the midnight.
 */
export function trialWindow(start: Date, timezone: Timezone): TrialWindow {
  const endDate = addDaysUTC(utcDateToLocalDate(start, timezone.value), TRIAL_DAYS);
  const dayOfMonth = Number(endDate.slice(8, 10));
  return {
    trialEndsAt: localDateStartUTC(endDate, timezone.value),
    nextDueDate: CalendarDate.reconstitute(endDate),
    anchorDay: Math.min(dayOfMonth, ANCHOR_DAY_MAX),
  };
}

export function assertCurrencyMatchesCountry(countryCode: CountryCode, currency: string): void {
  if (countryCode.spec.currency !== currency) {
    throw new SubscriptionInvariantError(
      `Currency ${currency} is not the billing currency of ${countryCode.value}`,
    );
  }
}
