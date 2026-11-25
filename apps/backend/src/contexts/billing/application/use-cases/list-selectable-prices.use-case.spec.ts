import { CountryCodeErrorCode } from '@ikaro/types';
import { FixedClock } from '../../../../test/infrastructure/fixed-clock';
import { FeaturePriceBuilder, FeaturePriceVersionBuilder } from '../../../../test/builders/billing';
import { InMemoryFeaturePriceRepository } from '../../../../test/repositories/billing/in-memory-feature-price.repository';
import { CountryCodeValidationError } from '../../../../shared/value-objects/country-code.vo';
import { SIGNUP_SUPPORTED_COUNTRIES } from '../../domain/billing-constants';
import { ListSelectablePricesUseCase } from './list-selectable-prices.use-case';

// 2026-03-15 12:00 UTC is the same calendar day in São Paulo.
const NOON = new Date('2026-03-15T12:00:00Z');

describe('ListSelectablePricesUseCase', () => {
  let repo: InMemoryFeaturePriceRepository;
  let listSpy: jest.SpyInstance;

  const useCaseAt = (now: Date) => new ListSelectablePricesUseCase(repo, new FixedClock(now));

  beforeEach(() => {
    repo = new InMemoryFeaturePriceRepository();
    listSpy = jest.spyOn(repo, 'listSelectableByCountry');
  });

  it('lists a selectable price with its amount in force today, with the country envelope', async () => {
    repo.seed(
      new FeaturePriceBuilder()
        .withVersions([new FeaturePriceVersionBuilder().withAmountMinor(4900).build()])
        .build(),
    );

    const result = await useCaseAt(NOON).execute({ countryCode: 'BR' });

    expect(result).toEqual({
      offered: true,
      countryCode: 'BR',
      currency: 'BRL',
      taxBehavior: 'INCLUSIVE',
      prices: [
        {
          featureKey: 'HOTSITE',
          tier: 'STANDARD',
          cycle: 'MONTHLY',
          currency: 'BRL',
          amountMinor: 4900,
          effectiveFrom: '2026-01-01',
        },
      ],
    });
  });

  it('carries the earliest announced future version as `upcoming`', async () => {
    repo.seed(
      new FeaturePriceBuilder()
        .withVersions([
          new FeaturePriceVersionBuilder().withAmountMinor(4900).build(),
          new FeaturePriceVersionBuilder()
            .withEffectiveFrom('2026-07-01')
            .withAmountMinor(5900)
            .withAnnouncedAt(new Date('2026-05-01T00:00:00Z'))
            .build(),
        ])
        .build(),
    );

    const result = await useCaseAt(NOON).execute({ countryCode: 'BR' });

    expect(result).toMatchObject({
      prices: [{ upcoming: { amountMinor: 5900, effectiveFrom: '2026-07-01' } }],
    });
  });

  it('shows only the earliest of two announced future versions', async () => {
    repo.seed(
      new FeaturePriceBuilder()
        .withVersions([
          new FeaturePriceVersionBuilder().withAmountMinor(4900).build(),
          new FeaturePriceVersionBuilder()
            .withEffectiveFrom('2026-09-01')
            .withAmountMinor(6900)
            .withAnnouncedAt(new Date('2026-05-01T00:00:00Z'))
            .build(),
          new FeaturePriceVersionBuilder()
            .withEffectiveFrom('2026-07-01')
            .withAmountMinor(5900)
            .withAnnouncedAt(new Date('2026-05-01T00:00:00Z'))
            .build(),
        ])
        .build(),
    );

    const result = await useCaseAt(NOON).execute({ countryCode: 'BR' });

    expect(result).toMatchObject({
      prices: [{ upcoming: { amountMinor: 5900, effectiveFrom: '2026-07-01' } }],
    });
  });

  it('never shows a scheduled version that was not announced', async () => {
    repo.seed(
      new FeaturePriceBuilder()
        .withVersions([
          new FeaturePriceVersionBuilder().withAmountMinor(4900).build(),
          new FeaturePriceVersionBuilder()
            .withEffectiveFrom('2026-07-01')
            .withAmountMinor(5900)
            .build(),
        ])
        .build(),
    );

    const result = await useCaseAt(NOON).execute({ countryCode: 'BR' });

    expect(result).toMatchObject({ prices: [{ amountMinor: 4900 }] });
    expect(JSON.stringify(result)).not.toContain('upcoming');
  });

  it('omits a price hidden from new selection', async () => {
    repo.seed(
      new FeaturePriceBuilder()
        .withSelectable(false)
        .withVersions([new FeaturePriceVersionBuilder().build()])
        .build(),
    );

    const result = await useCaseAt(NOON).execute({ countryCode: 'BR' });

    expect(result).toMatchObject({ offered: true, prices: [] });
  });

  it('omits a price whose versions all start later, never showing it at zero', async () => {
    repo.seed(
      new FeaturePriceBuilder()
        .withVersions([new FeaturePriceVersionBuilder().withEffectiveFrom('2027-01-01').build()])
        .build(),
    );

    const result = await useCaseAt(NOON).execute({ countryCode: 'BR' });

    expect(result).toMatchObject({ prices: [] });
  });

  it('returns the envelope with no items for a supported country whose prices are all hidden', async () => {
    const result = await useCaseAt(NOON).execute({ countryCode: 'BR' });

    expect(result).toEqual({
      offered: true,
      countryCode: 'BR',
      currency: 'BRL',
      taxBehavior: 'INCLUSIVE',
      prices: [],
    });
  });

  it("does not list another country's prices", async () => {
    repo.seed(
      new FeaturePriceBuilder()
        .withCountryCode('US')
        .withVersions([new FeaturePriceVersionBuilder().withCurrency('USD').build()])
        .build(),
    );

    const result = await useCaseAt(NOON).execute({ countryCode: 'BR' });

    expect(result).toMatchObject({ prices: [] });
  });

  describe('"today" is the calendar date in the country timezone', () => {
    const tomorrowInSaoPaulo = () =>
      repo.seed(
        new FeaturePriceBuilder()
          .withVersions([
            new FeaturePriceVersionBuilder().withAmountMinor(4900).build(),
            new FeaturePriceVersionBuilder()
              .withEffectiveFrom('2026-03-16')
              .withAmountMinor(5900)
              .withAnnouncedAt(new Date('2026-03-01T00:00:00Z'))
              .build(),
          ])
          .build(),
      );

    it('23:30 in São Paulo on the 15th is still the 15th, although UTC is already the 16th', async () => {
      tomorrowInSaoPaulo();

      const result = await useCaseAt(new Date('2026-03-16T02:30:00Z')).execute({
        countryCode: 'BR',
      });

      expect(result).toMatchObject({
        prices: [
          { amountMinor: 4900, upcoming: { amountMinor: 5900, effectiveFrom: '2026-03-16' } },
        ],
      });
    });

    it('00:30 in São Paulo on the 16th is the 16th: the new price is in force', async () => {
      tomorrowInSaoPaulo();

      const result = await useCaseAt(new Date('2026-03-16T03:30:00Z')).execute({
        countryCode: 'BR',
      });

      expect(result).toMatchObject({ prices: [{ amountMinor: 5900 }] });
    });
  });

  describe('a country a visitor cannot sign up from', () => {
    it('answers not offered for the US although its prices exist, and reads no price', async () => {
      repo.seed(
        new FeaturePriceBuilder()
          .withCountryCode('US')
          .withVersions([new FeaturePriceVersionBuilder().withCurrency('USD').build()])
          .build(),
      );
      expect(SIGNUP_SUPPORTED_COUNTRIES).not.toContain('US');

      await expect(useCaseAt(NOON).execute({ countryCode: 'US' })).resolves.toEqual({
        offered: false,
      });
      expect(listSpy).not.toHaveBeenCalled();
    });

    it('answers not offered for a two-letter country the platform does not know', async () => {
      await expect(useCaseAt(NOON).execute({ countryCode: 'ZZ' })).resolves.toEqual({
        offered: false,
      });
      expect(listSpy).not.toHaveBeenCalled();
    });
  });

  describe('a code that is not a country', () => {
    it.each(['', 'B', 'BRA', '12', 'B1'])('throws FORMAT_INVALID for %j', async (code) => {
      const error: unknown = await useCaseAt(NOON)
        .execute({ countryCode: code })
        .catch((err: unknown) => err);

      expect(error).toBeInstanceOf(CountryCodeValidationError);
      expect((error as CountryCodeValidationError).code).toBe(CountryCodeErrorCode.FORMAT_INVALID);
      expect(listSpy).not.toHaveBeenCalled();
    });

    it('accepts a lowercase or padded code, as CountryCode normalises it', async () => {
      await expect(useCaseAt(NOON).execute({ countryCode: ' br ' })).resolves.toMatchObject({
        offered: true,
        countryCode: 'BR',
      });
    });
  });
});
