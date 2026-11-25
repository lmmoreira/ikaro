import type { CalendarDate } from '../../../../shared/value-objects/calendar-date.vo';
import type { CountryCode } from '../../../../shared/value-objects/country-code.vo';
import type { FeaturePriceCycle } from '../../domain/feature-price.aggregate';
import type { SelectionEntry } from '../../domain/plan-selection';
import type { IFeaturePriceRepository } from '../ports/feature-price-repository.port';
import { type PricedEntry, priceEntry } from './billing-summary.helper';

/**
 * Each entry with the price aggregate and the amount in force on `date` (`null` when none): the one
 * way the summary, the plan catalog and the plan preview price a selection, so the three can never
 * disagree. It ignores `selectable` (a hidden price still renews); callers that need "may be newly
 * picked" read `price.selectable` off the result. At most one query per entry (six features at most).
 */
export function priceSelection(
  prices: IFeaturePriceRepository,
  entries: readonly SelectionEntry[],
  countryCode: CountryCode,
  cycle: FeaturePriceCycle,
  date: CalendarDate,
): Promise<PricedEntry[]> {
  return Promise.all(
    entries.map(async (entry) =>
      priceEntry(
        entry,
        await prices.findByNaturalKey(entry.featureKey, countryCode, entry.tier, cycle),
        date,
      ),
    ),
  );
}
