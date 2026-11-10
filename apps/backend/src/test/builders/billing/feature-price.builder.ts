import type { FeatureKey } from '@ikaro/validation';
import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { CalendarDate } from '../../../shared/value-objects/calendar-date.vo';
import { CountryCode } from '../../../shared/value-objects/country-code.vo';
import {
  FeaturePrice,
  FeaturePriceCycle,
  FeaturePriceVersion,
  FeatureTier,
} from '../../../contexts/billing/domain/feature-price.aggregate';
import { MinorAmount } from '../../../contexts/billing/domain/value-objects/minor-amount.vo';

const DEFAULT_CURRENCY_BY_COUNTRY: Record<string, string> = { BR: 'BRL', US: 'USD' };

export class FeaturePriceVersionBuilder {
  private id = uuidv7();
  private amountMinor = 4900;
  private currency = 'BRL';
  private effectiveFrom = '2026-01-01';
  private announcedAt: Date | null = null;
  private createdBy = 'SYSTEM';
  private reason = 'Initial catalog (M25-S02)';
  private supersededAt: Date | null = null;
  private batchId: string | null = null;

  withAmountMinor(amountMinor: number): this {
    this.amountMinor = amountMinor;
    return this;
  }

  withCurrency(currency: string): this {
    this.currency = currency;
    return this;
  }

  withEffectiveFrom(effectiveFrom: string): this {
    this.effectiveFrom = effectiveFrom;
    return this;
  }

  withSupersededAt(supersededAt: Date | null): this {
    this.supersededAt = supersededAt;
    return this;
  }

  build(): FeaturePriceVersion {
    return {
      id: this.id,
      amount: MinorAmount.create(this.amountMinor, this.currency),
      effectiveFrom: CalendarDate.create(this.effectiveFrom),
      announcedAt: this.announcedAt,
      createdBy: this.createdBy,
      reason: this.reason,
      supersededAt: this.supersededAt,
      batchId: this.batchId,
    };
  }
}

export class FeaturePriceBuilder {
  private id = uuidv7();
  private featureKey: FeatureKey = 'HOTSITE';
  private countryCode = 'BR';
  private tier: FeatureTier = 'STANDARD';
  private cycle: FeaturePriceCycle = 'MONTHLY';
  private currency: string | null = null;
  private selectable = true;
  private versions: FeaturePriceVersion[] = [];

  withId(id: string): this {
    this.id = id;
    return this;
  }

  withFeatureKey(featureKey: FeatureKey): this {
    this.featureKey = featureKey;
    return this;
  }

  withCountryCode(countryCode: string): this {
    this.countryCode = countryCode;
    return this;
  }

  withTier(tier: FeatureTier): this {
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

  withVersions(versions: FeaturePriceVersion[]): this {
    this.versions = versions;
    return this;
  }

  build(): FeaturePrice {
    const price = FeaturePrice.reconstitute({
      id: this.id,
      featureKey: this.featureKey,
      countryCode: CountryCode.create(this.countryCode),
      tier: this.tier,
      cycle: this.cycle,
      currency: this.currency ?? DEFAULT_CURRENCY_BY_COUNTRY[this.countryCode] ?? 'BRL',
      selectable: this.selectable,
      versions: this.versions,
    });
    price.clearDomainEvents();
    return price;
  }
}
