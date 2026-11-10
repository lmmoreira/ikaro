import type { FeatureKey } from '@ikaro/validation';
import type {
  FeaturePrice,
  FeaturePriceCycle,
  FeatureTier,
} from '../../domain/feature-price.aggregate';
import type { CountryCode } from '../../../../shared/value-objects/country-code.vo';

export const FEATURE_PRICE_REPOSITORY = Symbol('IFeaturePriceRepository');

/**
 * Read side of the platform-wide price list (no tenant id anywhere). The write side — operator
 * price changes, supersession — arrives with M26's UC-112.
 */
export interface IFeaturePriceRepository {
  findByNaturalKey(
    featureKey: FeatureKey,
    countryCode: CountryCode,
    tier: FeatureTier,
    cycle: FeaturePriceCycle,
  ): Promise<FeaturePrice | null>;

  /** Every price a manager may pick for a NEW selection in this country (`selectable = true`). */
  listSelectableByCountry(countryCode: CountryCode): Promise<FeaturePrice[]>;
}
