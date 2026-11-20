import { Charge } from './charge.aggregate';
import { ChargeLine } from './charge-line';
import { chargePriceKey } from './charge-price-key';
import { ChargeInvariantError } from './errors/billing-domain.error';
import type { SelectionEntry } from './plan-selection';
import type { Subscription } from './subscription.aggregate';
import type { IssuedPeriodWindow } from './subscription-issue-window';
import type { MinorAmount } from './value-objects/minor-amount.vo';

export interface PeriodChargeInput {
  subscription: Subscription;
  /** The items the period covers: the subscription's plan going forward (`subscription.selection`). */
  items: readonly SelectionEntry[];
  /** One resolved price per item, from the versions in force **on the period's start date**, keyed by `chargePriceKey`. */
  prices: ReadonlyMap<string, MinorAmount>;
  /** The period being issued, as `Subscription.advanceToNextPeriod()` returned it. */
  window: IssuedPeriodWindow;
}

/**
 * Builds the `PERIOD` charge of one service period (UC-113 step 1 to 3): the lines are the items
 * the period covers, each priced from the version in force on the period's **start date** (an
 * invoice issued early uses its future period's price), the due date is the period's first day and
 * the provider account is the subscription's. The single place the period-charge rule lives, next
 * to `RecoveryChargeFactory`. Domain code: it takes already-resolved inputs and never calls a use
 * case, so the caller resolves the prices through `GetFeaturePriceAtUseCase`'s lookup.
 */
export class PeriodChargeFactory {
  static build(input: PeriodChargeInput): Charge {
    const { subscription, items, prices, window } = input;
    const lines = items.map((item) => {
      const unitPrice = prices.get(chargePriceKey(item.featureKey, item.tier));
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
      kind: 'PERIOD',
      periodStart: window.periodStart,
      periodEnd: window.periodEnd,
      dueDate: window.periodStart,
      lines,
      currency: subscription.currency,
    });
  }
}
