import type { FeatureKey } from '@ikaro/validation';
import type { CalendarDate } from '../../../../shared/value-objects/calendar-date.vo';
import type {
  FeaturePrice,
  FeaturePriceCycle,
  FeatureTier,
} from '../../domain/feature-price.aggregate';

/** An announced future price of a selectable tier: the earliest one after the date it is read at. */
export interface UpcomingSelectablePrice {
  amountMinor: number;
  effectiveFrom: string;
}

export interface SelectablePriceItem {
  featureKey: FeatureKey;
  tier: FeatureTier;
  cycle: FeaturePriceCycle;
  currency: string;
  amountMinor: number;
  effectiveFrom: string;
  upcoming?: UpcomingSelectablePrice;
}

/**
 * What a manager may pick for a new selection on a date: every `selectable` price that has a
 * version in force on it, with the next announced version when there is one. A price whose
 * versions all start later is omitted, never shown at zero. The one projection behind the public
 * price list (`ListSelectablePricesUseCase`) and the Plano tab's catalog, so the two cannot differ.
 */
export function projectSelectablePrices(
  prices: readonly FeaturePrice[],
  at: CalendarDate,
): SelectablePriceItem[] {
  const items: SelectablePriceItem[] = [];
  for (const price of prices) {
    const version = price.versionInForceAt(at);
    if (!version) continue;
    const next = price.announcedVersionsAfter(at)[0];
    items.push({
      featureKey: price.featureKey,
      tier: price.tier,
      cycle: price.cycle,
      currency: price.currency,
      amountMinor: version.amount.amountMinor,
      effectiveFrom: version.effectiveFrom.value,
      ...(next && {
        upcoming: { amountMinor: next.amount.amountMinor, effectiveFrom: next.effectiveFrom.value },
      }),
    });
  }
  return items;
}
