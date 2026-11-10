import { FeaturePriceBuilder, FeaturePriceVersionBuilder } from '../../../../test/builders/billing';
import { InMemoryFeaturePriceRepository } from '../../../../test/repositories/billing/in-memory-feature-price.repository';
import { ListSelectablePricesUseCase } from './list-selectable-prices.use-case';

describe('ListSelectablePricesUseCase', () => {
  let repo: InMemoryFeaturePriceRepository;
  let useCase: ListSelectablePricesUseCase;

  beforeEach(() => {
    repo = new InMemoryFeaturePriceRepository();
    useCase = new ListSelectablePricesUseCase(repo);
  });

  it('lists a selectable price with its amount in force on the date', async () => {
    repo.seed(
      new FeaturePriceBuilder()
        .withVersions([new FeaturePriceVersionBuilder().withAmountMinor(4900).build()])
        .build(),
    );

    const result = await useCase.execute({ countryCode: 'BR', at: '2026-03-15' });

    expect(result.countryCode).toBe('BR');
    expect(result.prices).toEqual([
      {
        featureKey: 'HOTSITE',
        tier: 'STANDARD',
        cycle: 'MONTHLY',
        currency: 'BRL',
        amountMinor: 4900,
        effectiveFrom: '2026-01-01',
      },
    ]);
  });

  it('omits a price hidden from new selection', async () => {
    repo.seed(
      new FeaturePriceBuilder()
        .withSelectable(false)
        .withVersions([new FeaturePriceVersionBuilder().build()])
        .build(),
    );

    const result = await useCase.execute({ countryCode: 'BR', at: '2026-03-15' });

    expect(result.prices).toEqual([]);
  });

  it('omits a price whose versions all start after the date, never showing it at zero', async () => {
    repo.seed(
      new FeaturePriceBuilder()
        .withVersions([new FeaturePriceVersionBuilder().withEffectiveFrom('2027-01-01').build()])
        .build(),
    );

    const result = await useCase.execute({ countryCode: 'BR', at: '2026-03-15' });

    expect(result.prices).toEqual([]);
  });

  it("does not list another country's prices", async () => {
    repo.seed(
      new FeaturePriceBuilder()
        .withCountryCode('US')
        .withVersions([new FeaturePriceVersionBuilder().withCurrency('USD').build()])
        .build(),
    );

    const result = await useCase.execute({ countryCode: 'BR', at: '2026-03-15' });

    expect(result.prices).toEqual([]);
  });
});
