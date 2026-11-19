import type { FeatureKey } from '@ikaro/validation';
import type { FeatureTier } from '../../../contexts/billing/domain/feature-price.aggregate';
import { ChargeLine } from '../../../contexts/billing/domain/charge-line';
import { MinorAmount } from '../../../contexts/billing/domain/value-objects/minor-amount.vo';

export class ChargeLineBuilder {
  private featureKey: FeatureKey = 'HOTSITE';
  private tier: FeatureTier = 'STANDARD';
  private unitPriceMinor = 4900;
  private currency = 'BRL';

  withFeatureKey(featureKey: FeatureKey): this {
    this.featureKey = featureKey;
    return this;
  }

  withTier(tier: FeatureTier): this {
    this.tier = tier;
    return this;
  }

  withUnitPriceMinor(unitPriceMinor: number): this {
    this.unitPriceMinor = unitPriceMinor;
    return this;
  }

  withCurrency(currency: string): this {
    this.currency = currency;
    return this;
  }

  /** Built through `create`, so an invalid feature / tier pair fails like production code. */
  build(): ChargeLine {
    return ChargeLine.create({
      featureKey: this.featureKey,
      tier: this.tier,
      unitPrice: MinorAmount.create(this.unitPriceMinor, this.currency),
    });
  }
}
