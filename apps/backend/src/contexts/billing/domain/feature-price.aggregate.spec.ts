import { CalendarDate } from '../../../shared/value-objects/calendar-date.vo';
import { CountryCode } from '../../../shared/value-objects/country-code.vo';
import { FeaturePriceBuilder, FeaturePriceVersionBuilder } from '../../../test/builders/billing';
import { FeaturePriceInvariantError } from './errors/billing-domain.error';
import { FeaturePrice, NewFeaturePriceVersion } from './feature-price.aggregate';
import { MinorAmount } from './value-objects/minor-amount.vo';

const day = (value: string): CalendarDate => CalendarDate.create(value);

function newVersion(
  effectiveFrom: string,
  amountMinor = 5900,
  currency = 'BRL',
): NewFeaturePriceVersion {
  // A full version is assignable here; addVersion() always stores it with supersededAt = null.
  return new FeaturePriceVersionBuilder()
    .withEffectiveFrom(effectiveFrom)
    .withAmountMinor(amountMinor)
    .withCurrency(currency)
    .build();
}

function createProps(overrides: Partial<Parameters<typeof FeaturePrice.create>[0]> = {}) {
  return {
    id: 'price-1',
    featureKey: 'HOTSITE' as const,
    countryCode: CountryCode.create('BR'),
    tier: 'STANDARD' as const,
    cycle: 'MONTHLY' as const,
    currency: 'BRL',
    selectable: true,
    ...overrides,
  };
}

describe('FeaturePrice', () => {
  describe('create', () => {
    it('builds a valid price with no versions yet', () => {
      const price = FeaturePrice.create(createProps());

      expect(price.versions).toHaveLength(0);
      expect(price.domainEvents).toHaveLength(0);
    });

    it('accepts both chatbot tiers', () => {
      expect(() =>
        FeaturePrice.create(createProps({ featureKey: 'CHATBOT', tier: 'BASIC' })),
      ).not.toThrow();
      expect(() =>
        FeaturePrice.create(createProps({ featureKey: 'CHATBOT', tier: 'PLUS' })),
      ).not.toThrow();
    });

    it('rejects a chatbot price with the STANDARD tier', () => {
      expect(() =>
        FeaturePrice.create(createProps({ featureKey: 'CHATBOT', tier: 'STANDARD' })),
      ).toThrow(FeaturePriceInvariantError);
    });

    it.each(['BASIC', 'PLUS'] as const)('rejects the %s tier on a non-chatbot feature', (tier) => {
      expect(() => FeaturePrice.create(createProps({ featureKey: 'BOOKING', tier }))).toThrow(
        FeaturePriceInvariantError,
      );
    });

    it('rejects a cycle other than MONTHLY', () => {
      const props = { ...createProps(), cycle: 'ANNUAL' as unknown as 'MONTHLY' };

      expect(() => FeaturePrice.create(props)).toThrow(FeaturePriceInvariantError);
    });

    it('rejects a currency that does not match the country', () => {
      expect(() => FeaturePrice.create(createProps({ currency: 'USD' }))).toThrow(
        FeaturePriceInvariantError,
      );
      expect(() =>
        FeaturePrice.create(
          createProps({ countryCode: CountryCode.create('US'), currency: 'BRL' }),
        ),
      ).toThrow(FeaturePriceInvariantError);
    });
  });

  describe('addVersion', () => {
    it('appends a first version and a later one', () => {
      const price = FeaturePrice.create(createProps());

      price.addVersion(newVersion('2026-01-01', 4900));
      price.addVersion(newVersion('2026-06-01', 5900));

      expect(price.versions.map((v) => v.effectiveFrom.value)).toEqual([
        '2026-01-01',
        '2026-06-01',
      ]);
    });

    it('rejects a version that starts earlier than an existing one', () => {
      const price = FeaturePrice.create(createProps());
      price.addVersion(newVersion('2026-06-01'));

      expect(() => price.addVersion(newVersion('2026-05-31'))).toThrow(FeaturePriceInvariantError);
    });

    it('rejects a version that starts on the same day as a live one', () => {
      const price = FeaturePrice.create(createProps());
      price.addVersion(newVersion('2026-06-01'));

      expect(() => price.addVersion(newVersion('2026-06-01'))).toThrow(FeaturePriceInvariantError);
    });

    it('rejects a version whose currency differs from the price', () => {
      const price = FeaturePrice.create(createProps());

      expect(() => price.addVersion(newVersion('2026-01-01', 4900, 'USD'))).toThrow(
        FeaturePriceInvariantError,
      );
    });

    it('rejects a negative amount before it can become a version', () => {
      expect(() => MinorAmount.create(-100, 'BRL')).toThrow();
    });

    it('does not let a superseded version block a new one', () => {
      const price = new FeaturePriceBuilder()
        .withVersions([
          new FeaturePriceVersionBuilder().withEffectiveFrom('2026-01-01').build(),
          new FeaturePriceVersionBuilder()
            .withEffectiveFrom('2026-09-01')
            .withSupersededAt(new Date('2026-03-01T00:00:00Z'))
            .build(),
        ])
        .build();

      expect(() => price.addVersion(newVersion('2026-06-01'))).not.toThrow();
    });
  });

  describe('versionInForceAt', () => {
    const price = () =>
      new FeaturePriceBuilder()
        .withVersions([
          new FeaturePriceVersionBuilder()
            .withEffectiveFrom('2026-01-01')
            .withAmountMinor(4900)
            .build(),
          new FeaturePriceVersionBuilder()
            .withEffectiveFrom('2026-07-01')
            .withAmountMinor(5900)
            .build(),
        ])
        .build();

    it('returns null before the first version starts', () => {
      expect(price().versionInForceAt(day('2025-12-31'))).toBeNull();
    });

    it('returns the earlier version until the future-dated change starts', () => {
      expect(price().versionInForceAt(day('2026-06-30'))?.amount.amountMinor).toBe(4900);
    });

    it('switches on the effective day itself', () => {
      expect(price().versionInForceAt(day('2026-07-01'))?.amount.amountMinor).toBe(5900);
    });

    it('keeps the latest version in force afterwards', () => {
      expect(price().versionInForceAt(day('2030-01-01'))?.amount.amountMinor).toBe(5900);
    });

    it('never selects a superseded version', () => {
      const withSuperseded = new FeaturePriceBuilder()
        .withVersions([
          new FeaturePriceVersionBuilder()
            .withEffectiveFrom('2026-01-01')
            .withAmountMinor(4900)
            .build(),
          new FeaturePriceVersionBuilder()
            .withEffectiveFrom('2026-07-01')
            .withAmountMinor(9900)
            .withSupersededAt(new Date('2026-02-01T00:00:00Z'))
            .build(),
        ])
        .build();

      expect(withSuperseded.versionInForceAt(day('2026-08-01'))?.amount.amountMinor).toBe(4900);
    });

    it('still answers for a price hidden from new selection (renewals ignore selectable)', () => {
      const hidden = new FeaturePriceBuilder()
        .withSelectable(false)
        .withVersions([new FeaturePriceVersionBuilder().withAmountMinor(4900).build()])
        .build();

      expect(hidden.versionInForceAt(day('2026-08-01'))?.amount.amountMinor).toBe(4900);
    });
  });
});
