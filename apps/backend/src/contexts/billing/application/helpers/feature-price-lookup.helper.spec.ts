import { CalendarDate } from '../../../../shared/value-objects/calendar-date.vo';
import { CountryCode } from '../../../../shared/value-objects/country-code.vo';
import { FeaturePriceBuilder, FeaturePriceVersionBuilder } from '../../../../test/builders/billing';
import { InMemoryFeaturePriceRepository } from '../../../../test/repositories/billing/in-memory-feature-price.repository';
import { FeaturePriceNotFoundError } from '../../domain/errors/billing-domain.error';
import { findFeaturePriceInForce } from './feature-price-lookup.helper';

const BR = CountryCode.create('BR');
const date = (value: string): CalendarDate => CalendarDate.create(value);

describe('findFeaturePriceInForce', () => {
  let prices: InMemoryFeaturePriceRepository;

  beforeEach(() => {
    prices = new InMemoryFeaturePriceRepository();
  });

  const lookup = (at: string) =>
    findFeaturePriceInForce(prices, 'HOTSITE', BR, 'STANDARD', 'MONTHLY', date(at));

  it('returns the price and the version in force on the date', async () => {
    prices.seed(
      new FeaturePriceBuilder()
        .withVersions([
          new FeaturePriceVersionBuilder()
            .withAmountMinor(4900)
            .withEffectiveFrom('2026-01-01')
            .build(),
        ])
        .build(),
    );

    const found = await lookup('2026-03-10');

    expect(found.version.amount.amountMinor).toBe(4900);
    expect(found.price.featureKey).toBe('HOTSITE');
  });

  it('picks the latest version that has started when the price changed', async () => {
    prices.seed(
      new FeaturePriceBuilder()
        .withVersions([
          new FeaturePriceVersionBuilder()
            .withAmountMinor(4900)
            .withEffectiveFrom('2026-01-01')
            .build(),
          new FeaturePriceVersionBuilder()
            .withAmountMinor(5900)
            .withEffectiveFrom('2026-06-01')
            .build(),
        ])
        .build(),
    );

    expect((await lookup('2026-05-31')).version.amount.amountMinor).toBe(4900);
    expect((await lookup('2026-06-01')).version.amount.amountMinor).toBe(5900);
  });

  it('ignores a superseded version: a withdrawn price change never applies', async () => {
    prices.seed(
      new FeaturePriceBuilder()
        .withVersions([
          new FeaturePriceVersionBuilder()
            .withAmountMinor(4900)
            .withEffectiveFrom('2026-01-01')
            .build(),
          new FeaturePriceVersionBuilder()
            .withAmountMinor(9900)
            .withEffectiveFrom('2026-02-01')
            .withSupersededAt(new Date('2026-01-15T00:00:00Z'))
            .build(),
        ])
        .build(),
    );

    expect((await lookup('2026-03-10')).version.amount.amountMinor).toBe(4900);
  });

  it('ignores `selectable`: a price hidden from new selection still renews', async () => {
    prices.seed(
      new FeaturePriceBuilder()
        .withSelectable(false)
        .withVersions([new FeaturePriceVersionBuilder().withAmountMinor(4900).build()])
        .build(),
    );

    expect((await lookup('2026-03-10')).version.amount.amountMinor).toBe(4900);
  });

  it('is a typed error, never a zero price, for a price that does not exist', async () => {
    await expect(lookup('2026-03-10')).rejects.toBeInstanceOf(FeaturePriceNotFoundError);
  });

  it('is a typed error for a price whose first version has not started yet', async () => {
    prices.seed(
      new FeaturePriceBuilder()
        .withVersions([new FeaturePriceVersionBuilder().withEffectiveFrom('2027-01-01').build()])
        .build(),
    );

    await expect(lookup('2026-03-10')).rejects.toThrow(
      'No price version in force for HOTSITE/BR/STANDARD/MONTHLY on 2026-03-10',
    );
  });

  it('matches the exact feature, country, tier and cycle', async () => {
    prices.seed(
      new FeaturePriceBuilder()
        .withFeatureKey('BOOKING')
        .withVersions([new FeaturePriceVersionBuilder().build()])
        .build(),
    );

    await expect(lookup('2026-03-10')).rejects.toBeInstanceOf(FeaturePriceNotFoundError);
  });
});
