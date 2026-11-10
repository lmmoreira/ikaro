import { Inject, Injectable } from '@nestjs/common';
import type { FeatureKey } from '@ikaro/validation';
import { CalendarDate } from '../../../../shared/value-objects/calendar-date.vo';
import { CountryCode } from '../../../../shared/value-objects/country-code.vo';
import type { FeaturePriceCycle, FeatureTier } from '../../domain/feature-price.aggregate';
import {
  FEATURE_PRICE_REPOSITORY,
  IFeaturePriceRepository,
} from '../ports/feature-price-repository.port';

export type ListSelectablePricesUseCaseInput = {
  countryCode: string;
  /** YYYY-MM-DD. */
  at: string;
};

export type SelectablePriceItem = {
  featureKey: FeatureKey;
  tier: FeatureTier;
  cycle: FeaturePriceCycle;
  currency: string;
  amountMinor: number;
  effectiveFrom: string;
};

export type ListSelectablePricesUseCaseResult = {
  countryCode: string;
  prices: SelectablePriceItem[];
};

/**
 * What a manager may pick for a new selection in a country on a date (M26's price page): every
 * `selectable` price that has a version in force on that date. A price whose versions all start
 * later is omitted, never shown at zero.
 */
@Injectable()
export class ListSelectablePricesUseCase {
  constructor(@Inject(FEATURE_PRICE_REPOSITORY) private readonly repo: IFeaturePriceRepository) {}

  async execute(dto: ListSelectablePricesUseCaseInput): Promise<ListSelectablePricesUseCaseResult> {
    const countryCode = CountryCode.create(dto.countryCode);
    const at = CalendarDate.create(dto.at);

    const prices: SelectablePriceItem[] = [];
    for (const price of await this.repo.listSelectableByCountry(countryCode)) {
      const version = price.versionInForceAt(at);
      if (!version) continue;
      prices.push({
        featureKey: price.featureKey,
        tier: price.tier,
        cycle: price.cycle,
        currency: price.currency,
        amountMinor: version.amount.amountMinor,
        effectiveFrom: version.effectiveFrom.value,
      });
    }
    return { countryCode: countryCode.value, prices };
  }
}
