import { Inject, Injectable } from '@nestjs/common';
import type { FeatureKey } from '@ikaro/validation';
import { CalendarDate } from '../../../../shared/value-objects/calendar-date.vo';
import { CountryCode } from '../../../../shared/value-objects/country-code.vo';
import { FeaturePriceNotFoundError } from '../../domain/errors/billing-domain.error';
import type { FeaturePriceCycle, FeatureTier } from '../../domain/feature-price.aggregate';
import {
  FEATURE_PRICE_REPOSITORY,
  IFeaturePriceRepository,
} from '../ports/feature-price-repository.port';

export type GetFeaturePriceAtUseCaseInput = {
  featureKey: FeatureKey;
  countryCode: string;
  tier: FeatureTier;
  cycle: FeaturePriceCycle;
  /** A service-period start date, YYYY-MM-DD. */
  at: string;
};

export type GetFeaturePriceAtUseCaseResult = {
  featureKey: FeatureKey;
  countryCode: string;
  tier: FeatureTier;
  cycle: FeaturePriceCycle;
  currency: string;
  amountMinor: number;
  effectiveFrom: string;
  versionId: string;
};

/**
 * The amount in force for a feature × country × tier × cycle on a service-period start date
 * (UC-113's renewal lookup, used in-process by M26). It deliberately ignores `selectable`: a price
 * hidden from new selection still renews. An unknown price, or one with no version started yet,
 * is a typed error — never a zero price.
 */
@Injectable()
export class GetFeaturePriceAtUseCase {
  constructor(@Inject(FEATURE_PRICE_REPOSITORY) private readonly repo: IFeaturePriceRepository) {}

  async execute(dto: GetFeaturePriceAtUseCaseInput): Promise<GetFeaturePriceAtUseCaseResult> {
    const countryCode = CountryCode.create(dto.countryCode);
    const at = CalendarDate.create(dto.at);

    const price = await this.repo.findByNaturalKey(
      dto.featureKey,
      countryCode,
      dto.tier,
      dto.cycle,
    );
    if (!price) {
      throw new FeaturePriceNotFoundError(
        `No price for ${dto.featureKey}/${countryCode.value}/${dto.tier}/${dto.cycle}`,
      );
    }
    const version = price.versionInForceAt(at);
    if (!version) {
      throw new FeaturePriceNotFoundError(
        `No price version in force for ${dto.featureKey}/${countryCode.value}/${dto.tier}/${dto.cycle} on ${at.value}`,
      );
    }
    return {
      featureKey: price.featureKey,
      countryCode: price.countryCode.value,
      tier: price.tier,
      cycle: price.cycle,
      currency: price.currency,
      amountMinor: version.amount.amountMinor,
      effectiveFrom: version.effectiveFrom.value,
      versionId: version.id,
    };
  }
}
