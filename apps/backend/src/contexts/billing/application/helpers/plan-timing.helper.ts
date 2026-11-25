import { addDaysUTC } from '../../../../shared/utils/calendar-date';
import { CalendarDate } from '../../../../shared/value-objects/calendar-date.vo';
import type { Subscription } from '../../domain/subscription.aggregate';
import type { IChargeRepository } from '../ports/charge-repository.port';

/**
 * UC-136 A7: whether the next period's invoice is already paid, so a change cannot touch it. The
 * aggregate does not know about charges, so the caller reads this one fact and hands it to
 * `Subscription.nextPeriodStart` / `previewSelection`; the save (M26-S19) reads it the same way, so
 * preview and save never disagree.
 * - `TRIALING`: the first invoice (starting on the trial's end day) is paid.
 * - `ACTIVE` / `PAST_DUE`: the earliest invoice for a period that starts after today is paid.
 * - `SUSPENDED` and exempt: there is no next period to protect.
 */
export async function readNextPeriodPaid(
  charges: IChargeRepository,
  subscription: Subscription,
  today: string,
): Promise<boolean> {
  if (subscription.exempt || subscription.status === 'SUSPENDED') return false;
  const from =
    subscription.status === 'TRIALING' ? subscription.firstInvoiceFrom : addDaysUTC(today, 1);
  if (from === null) return false;
  const next = await charges.findFirstPeriodCharge(subscription.tenantId, subscription.id, from);
  return next?.status === 'PAID';
}

/**
 * The date prices are read on: the service period a change takes effect in, or today while no
 * period is named (a payment suspension prices the recovery charge on the day, UC-136 A14).
 */
export function pricingDate(
  subscription: Subscription,
  nextPeriodPaid: boolean,
  today: string,
): CalendarDate {
  return subscription.nextPeriodStart(nextPeriodPaid) ?? CalendarDate.create(today);
}
