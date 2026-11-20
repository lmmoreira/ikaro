import type { FeatureKey } from '@ikaro/validation';
import { IFeaturePriceRepository } from '../../../contexts/billing/application/ports/feature-price-repository.port';
import {
  FeaturePrice,
  FeaturePriceCycle,
  FeatureTier,
} from '../../../contexts/billing/domain/feature-price.aggregate';
import { CountryCode } from '../../../shared/value-objects/country-code.vo';

export class InMemoryFeaturePriceRepository implements IFeaturePriceRepository {
  private readonly store: FeaturePrice[] = [];

  /** Test seam: the real adapter is read-only until M26, so tests seed prices directly. */
  seed(...prices: FeaturePrice[]): void {
    this.store.push(...prices);
  }

  /** Test seam: forgets every seeded price (a spec for a missing renewable price). */
  clear(): void {
    this.store.length = 0;
  }

  async findByNaturalKey(
    featureKey: FeatureKey,
    countryCode: CountryCode,
    tier: FeatureTier,
    cycle: FeaturePriceCycle,
  ): Promise<FeaturePrice | null> {
    return (
      this.store.find(
        (price) =>
          price.featureKey === featureKey &&
          price.countryCode.value === countryCode.value &&
          price.tier === tier &&
          price.cycle === cycle,
      ) ?? null
    );
  }

  async listSelectableByCountry(countryCode: CountryCode): Promise<FeaturePrice[]> {
    return this.store.filter(
      (price) => price.countryCode.value === countryCode.value && price.selectable,
    );
  }
}
