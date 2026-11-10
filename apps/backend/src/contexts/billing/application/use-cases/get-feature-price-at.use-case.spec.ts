import { FeaturePriceBuilder, FeaturePriceVersionBuilder } from '../../../../test/builders/billing';
import { InMemoryFeaturePriceRepository } from '../../../../test/repositories/billing/in-memory-feature-price.repository';
import { FeaturePriceNotFoundError } from '../../domain/errors/billing-domain.error';
import { GetFeaturePriceAtUseCase } from './get-feature-price-at.use-case';

describe('GetFeaturePriceAtUseCase', () => {
  let repo: InMemoryFeaturePriceRepository;
  let useCase: GetFeaturePriceAtUseCase;

  const input = (at: string) => ({
    featureKey: 'HOTSITE' as const,
    countryCode: 'BR',
    tier: 'STANDARD' as const,
    cycle: 'MONTHLY' as const,
    at,
  });

  beforeEach(() => {
    repo = new InMemoryFeaturePriceRepository();
    repo.seed(
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
        .build(),
    );
    useCase = new GetFeaturePriceAtUseCase(repo);
  });

  it('returns the version in force on the date', async () => {
    const result = await useCase.execute(input('2026-03-15'));

    expect(result).toMatchObject({
      featureKey: 'HOTSITE',
      countryCode: 'BR',
      currency: 'BRL',
      amountMinor: 4900,
      effectiveFrom: '2026-01-01',
    });
  });

  it('returns the future-dated amount once it has started', async () => {
    const result = await useCase.execute(input('2026-07-01'));

    expect(result.amountMinor).toBe(5900);
  });

  it('throws a typed error for an unknown price, never a zero price', async () => {
    await expect(
      useCase.execute({ ...input('2026-03-15'), featureKey: 'LOYALTY' }),
    ).rejects.toThrow(FeaturePriceNotFoundError);
  });

  it('throws a typed error when no version has started yet', async () => {
    await expect(useCase.execute(input('2025-12-31'))).rejects.toThrow(FeaturePriceNotFoundError);
  });
});
