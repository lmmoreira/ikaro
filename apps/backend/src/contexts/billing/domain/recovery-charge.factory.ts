import type { FeatureKey } from '@ikaro/validation';
import { addDaysUTC } from '../../../shared/utils/calendar-date';
import { CalendarDate } from '../../../shared/value-objects/calendar-date.vo';
import { RECOVERY_CHARGE_DUE_DAYS } from './billing-constants';
import { Charge } from './charge.aggregate';
import { ChargeLine } from './charge-line';
import { ChargeInvariantError } from './errors/billing-domain.error';
import type { FeatureTier } from './feature-price.aggregate';
import type { SelectionEntry } from './plan-selection';
import type { Subscription } from './subscription.aggregate';
import type { MinorAmount } from './value-objects/minor-amount.vo';

/** The key of one price in the map the caller resolved: `featureKey` and `tier`. */
export function recoveryPriceKey(featureKey: FeatureKey, tier: FeatureTier): string {
  return `${featureKey}/${tier}`;
}

export interface RecoveryChargeInput {
  subscription: Subscription;
  /** The subscription's current items; while suspended, the items a manager's plan save replaced outright (UC-136 A14). */
  items: readonly SelectionEntry[];
  /** One resolved price per item, from the versions in force **on `today`**, keyed by `recoveryPriceKey`. */
  prices: ReadonlyMap<string, MinorAmount>;
  /** Today as a date in the subscription's timezone (`subscriptions.timezone`), never read from a clock here. */
  today: CalendarDate;
}

/**
 * Builds the one-month `RECOVERY` charge that reactivates a suspended subscription: the amount is
 * fixed at issue from the prices of that day, the lines are the current items, the due date is
 * today + `RECOVERY_CHARGE_DUE_DAYS`, there are no period dates (the period lives on the
 * subscription and starts when the charge is paid), and the provider account is the subscription's.
 *
 * It is the single place the recovery rule lives (UC-115 step 3, UC-134, UC-113 A2), shared by the
 * status sweep, reactivate and the creation retry. Domain code: it takes already-resolved inputs
 * and never calls a use case, so the caller resolves the prices through `GetFeaturePriceAtUseCase`.
 */
export class RecoveryChargeFactory {
  static build(input: RecoveryChargeInput): Charge {
    const { subscription, items, prices, today } = input;
    const lines = items.map((item) => {
      const unitPrice = prices.get(recoveryPriceKey(item.featureKey, item.tier));
      // A missing price is never answered with a zero: the caller's price lookup failed.
      if (!unitPrice) {
        throw new ChargeInvariantError(`No price resolved for ${item.featureKey} ${item.tier}`);
      }
      return ChargeLine.create({ featureKey: item.featureKey, tier: item.tier, unitPrice });
    });
    return Charge.create({
      tenantId: subscription.tenantId,
      subscriptionId: subscription.id,
      merchantProfileKey: subscription.merchantProfileKey,
      kind: 'RECOVERY',
      periodStart: null,
      periodEnd: null,
      dueDate: CalendarDate.create(addDaysUTC(today.value, RECOVERY_CHARGE_DUE_DAYS)),
      lines,
      currency: subscription.currency,
    });
  }
}
