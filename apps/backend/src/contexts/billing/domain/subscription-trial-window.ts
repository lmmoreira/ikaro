import { DateTime } from 'luxon';
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
 * day-of-month of that end, clamped to 28 (the rule S05's backfill SQL mirrors). Calendar maths in
 * the snapshot zone, so a DST change inside the window never shifts the midnight.
 */
export function trialWindow(start: Date, timezone: Timezone): TrialWindow {
  const end = DateTime.fromJSDate(start, { zone: timezone.value })
    .startOf('day')
    .plus({ days: TRIAL_DAYS });
  return {
    trialEndsAt: end.toJSDate(),
    nextDueDate: CalendarDate.reconstitute(end.toISODate() as string),
    anchorDay: Math.min(end.day, ANCHOR_DAY_MAX),
  };
}

export function assertCurrencyMatchesCountry(countryCode: CountryCode, currency: string): void {
  if (countryCode.spec.currency !== currency) {
    throw new SubscriptionInvariantError(
      `Currency ${currency} is not the billing currency of ${countryCode.value}`,
    );
  }
}
