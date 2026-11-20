import type { FeatureKey } from '@ikaro/validation';
import type { CalendarDate } from '../../../../shared/value-objects/calendar-date.vo';
import type { CountryCode } from '../../../../shared/value-objects/country-code.vo';
import { FeaturePriceNotFoundError } from '../../domain/errors/billing-domain.error';
import type {
  FeaturePrice,
  FeaturePriceCycle,
  FeaturePriceVersion,
  FeatureTier,
} from '../../domain/feature-price.aggregate';
import type { IFeaturePriceRepository } from '../ports/feature-price-repository.port';

export interface FeaturePriceInForce {
  readonly price: FeaturePrice;
  readonly version: FeaturePriceVersion;
}

/**
 * The price version in force for a feature × country × tier × cycle on a service-period start date:
 * the one lookup behind `GetFeaturePriceAtUseCase` and the recovery charge of
 * `ApplyChargeFactService`, so the two can never disagree. It deliberately ignores `selectable` (a
 * price hidden from new selection still renews). An unknown price, or one with no version started
 * yet, is a typed error, never a zero price.
 */
export async function findFeaturePriceInForce(
  repo: IFeaturePriceRepository,
  featureKey: FeatureKey,
  countryCode: CountryCode,
  tier: FeatureTier,
  cycle: FeaturePriceCycle,
  at: CalendarDate,
): Promise<FeaturePriceInForce> {
  const price = await repo.findByNaturalKey(featureKey, countryCode, tier, cycle);
  if (!price) {
    throw new FeaturePriceNotFoundError(
      `No price for ${featureKey}/${countryCode.value}/${tier}/${cycle}`,
    );
  }
  const version = price.versionInForceAt(at);
  if (!version) {
    throw new FeaturePriceNotFoundError(
      `No price version in force for ${featureKey}/${countryCode.value}/${tier}/${cycle} on ${at.value}`,
    );
  }
  return { price, version };
}
