import { Inject, Injectable } from '@nestjs/common';
import type { TaxBehavior } from '@ikaro/i18n';
import { CountryCodeErrorCode } from '@ikaro/types';
import { CLOCK, type IClock } from '../../../../shared/ports/clock.port';
import { todayInTimezone } from '../../../../shared/utils/calendar-date';
import { CalendarDate } from '../../../../shared/value-objects/calendar-date.vo';
import {
  CountryCode,
  CountryCodeValidationError,
} from '../../../../shared/value-objects/country-code.vo';
import { SIGNUP_SUPPORTED_COUNTRIES } from '../../domain/billing-constants';
import {
  projectSelectablePrices,
  type SelectablePriceItem,
} from '../helpers/selectable-prices.helper';
import {
  FEATURE_PRICE_REPOSITORY,
  IFeaturePriceRepository,
} from '../ports/feature-price-repository.port';

export type { SelectablePriceItem };

export type ListSelectablePricesUseCaseInput = {
  countryCode: string;
};

/**
 * `offered: false` is a country a visitor cannot sign up from: one outside
 * `SIGNUP_SUPPORTED_COUNTRIES`, or a two-letter code the platform does not know. A supported
 * country is always `offered: true` with its envelope, even when every price is hidden.
 */
export type ListSelectablePricesUseCaseResult =
  | { offered: false }
  | {
      offered: true;
      countryCode: string;
      currency: string;
      taxBehavior: TaxBehavior;
      prices: SelectablePriceItem[];
    };

/**
 * The public price list (UC-128): what a visitor may pick for a new selection, today, in a country
 * they can sign up from. "Today" is the calendar date in the country's own timezone (the route has
 * no tenant), read from the injected clock so the dev clock moves it like the rest of Billing. Every
 * `selectable` price with a version in force, plus its announced next version
 * (`projectSelectablePrices`, shared with the Plano tab's catalog so the two cannot differ). A price
 * whose versions all start later is omitted, never shown at zero. A malformed code is the caller's
 * `400`; an unknown or unsupported country is not an error, it is simply not offered.
 */
@Injectable()
export class ListSelectablePricesUseCase {
  constructor(
    @Inject(FEATURE_PRICE_REPOSITORY) private readonly repo: IFeaturePriceRepository,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async execute(dto: ListSelectablePricesUseCaseInput): Promise<ListSelectablePricesUseCaseResult> {
    const countryCode = ListSelectablePricesUseCase.parseKnownCountry(dto.countryCode);
    if (!countryCode || !SIGNUP_SUPPORTED_COUNTRIES.includes(countryCode.value)) {
      return { offered: false };
    }
    const spec = countryCode.spec;
    const at = CalendarDate.create(todayInTimezone(spec.defaultTimezone, this.clock.now()));
    const prices = projectSelectablePrices(
      await this.repo.listSelectableByCountry(countryCode),
      at,
    );
    return {
      offered: true,
      countryCode: countryCode.value,
      currency: spec.currency,
      taxBehavior: spec.taxBehavior,
      prices,
    };
  }

  /** `null` for a well-formed code the platform does not know; a malformed one still throws. */
  private static parseKnownCountry(code: string): CountryCode | null {
    try {
      return CountryCode.create(code);
    } catch (err) {
      if (
        err instanceof CountryCodeValidationError &&
        err.code === CountryCodeErrorCode.UNSUPPORTED
      ) {
        return null;
      }
      throw err;
    }
  }
}
