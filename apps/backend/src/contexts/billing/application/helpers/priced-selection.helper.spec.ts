import { CalendarDate } from '../../../../shared/value-objects/calendar-date.vo';
import { CountryCode } from '../../../../shared/value-objects/country-code.vo';
import { FeaturePriceBuilder, FeaturePriceVersionBuilder } from '../../../../test/builders/billing';
import { InMemoryFeaturePriceRepository } from '../../../../test/repositories/billing/in-memory-feature-price.repository';
import { priceSelection } from './priced-selection.helper';

describe('priceSelection', () => {
  let prices: InMemoryFeaturePriceRepository;
  const brazil = CountryCode.create('BR');

  beforeEach(() => {
    prices = new InMemoryFeaturePriceRepository();
    prices.seed(
      new FeaturePriceBuilder()
        .withVersions([
          new FeaturePriceVersionBuilder().withAmountMinor(4900).build(),
          new FeaturePriceVersionBuilder()
            .withEffectiveFrom('2026-12-01')
            .withAmountMinor(5900)
            .build(),
        ])
        .build(),
    );
  });

  it('prices each entry at the version in force on the date, keeping the entry order', async () => {
    const entries = [
      { featureKey: 'HOTSITE' as const, tier: 'STANDARD' as const },
      { featureKey: 'BOOKING' as const, tier: 'STANDARD' as const },
    ];

    const before = await priceSelection(
      prices,
      entries,
      brazil,
      'MONTHLY',
      CalendarDate.create('2026-11-30'),
    );
    const after = await priceSelection(
      prices,
      entries,
      brazil,
      'MONTHLY',
      CalendarDate.create('2026-12-01'),
    );

    expect(before.map((priced) => [priced.entry.featureKey, priced.amountMinor])).toEqual([
      ['HOTSITE', 4900],
      ['BOOKING', null],
    ]);
    expect(after[0].amountMinor).toBe(5900);
  });

  it('keeps the price aggregate so a caller can read `selectable`, and prices a hidden one (a hidden price still renews)', async () => {
    prices.clear();
    prices.seed(
      new FeaturePriceBuilder()
        .withSelectable(false)
        .withVersions([new FeaturePriceVersionBuilder().withAmountMinor(4900).build()])
        .build(),
    );

    const [priced] = await priceSelection(
      prices,
      [{ featureKey: 'HOTSITE', tier: 'STANDARD' }],
      brazil,
      'MONTHLY',
      CalendarDate.create('2026-11-30'),
    );

    expect(priced.amountMinor).toBe(4900);
    expect(priced.price?.selectable).toBe(false);
  });

  it('answers an empty list for an empty selection, without a query', async () => {
    const lookup = jest.spyOn(prices, 'findByNaturalKey');

    await expect(
      priceSelection(prices, [], brazil, 'MONTHLY', CalendarDate.create('2026-11-30')),
    ).resolves.toEqual([]);
    expect(lookup).not.toHaveBeenCalled();
  });
});
