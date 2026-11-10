import { FeaturePriceEntity } from '../../../contexts/billing/infrastructure/entities/feature-price.entity';
import { uuidv7 } from '../../../shared/domain/uuid-v7';

export class FeaturePriceEntityBuilder {
  private id = uuidv7();
  private featureKey = 'HOTSITE';
  private countryCode = 'BR';
  private tier = 'STANDARD';
  private readonly cycle = 'MONTHLY';
  private currency = 'BRL';
  private selectable = true;

  withId(id: string): this {
    this.id = id;
    return this;
  }

  withFeatureKey(featureKey: string): this {
    this.featureKey = featureKey;
    return this;
  }

  withCountryCode(countryCode: string): this {
    this.countryCode = countryCode;
    return this;
  }

  withTier(tier: string): this {
    this.tier = tier;
    return this;
  }

  withCurrency(currency: string): this {
    this.currency = currency;
    return this;
  }

  withSelectable(selectable: boolean): this {
    this.selectable = selectable;
    return this;
  }

  build(): FeaturePriceEntity {
    const e = new FeaturePriceEntity();
    e.id = this.id;
    e.featureKey = this.featureKey;
    e.countryCode = this.countryCode;
    e.tier = this.tier;
    e.cycle = this.cycle;
    e.currency = this.currency;
    e.selectable = this.selectable;
    return e;
  }
}
