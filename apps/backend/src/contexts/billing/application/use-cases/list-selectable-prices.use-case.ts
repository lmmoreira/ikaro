import { Inject, Injectable } from '@nestjs/common';
import { CalendarDate } from '../../../../shared/value-objects/calendar-date.vo';
import { CountryCode } from '../../../../shared/value-objects/country-code.vo';
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
  /** YYYY-MM-DD. */
  at: string;
};

export type ListSelectablePricesUseCaseResult = {
  countryCode: string;
  prices: SelectablePriceItem[];
};

/**
 * What a manager may pick for a new selection in a country on a date (M26's price page): every
 * `selectable` price that has a version in force on that date, with its announced next version
 * (`projectSelectablePrices`, shared with the Plano tab's catalog). A price whose versions all
 * start later is omitted, never shown at zero.
 */
@Injectable()
export class ListSelectablePricesUseCase {
  constructor(@Inject(FEATURE_PRICE_REPOSITORY) private readonly repo: IFeaturePriceRepository) {}

  async execute(dto: ListSelectablePricesUseCaseInput): Promise<ListSelectablePricesUseCaseResult> {
    const countryCode = CountryCode.create(dto.countryCode);
    const at = CalendarDate.create(dto.at);
    const prices = projectSelectablePrices(
      await this.repo.listSelectableByCountry(countryCode),
      at,
    );
    return { countryCode: countryCode.value, prices };
  }
}
