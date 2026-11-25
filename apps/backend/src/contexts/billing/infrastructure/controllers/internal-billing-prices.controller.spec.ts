import { HttpException, HttpStatus } from '@nestjs/common';
import { CountryCodeErrorCode } from '@ikaro/types';
import { FeaturePriceBuilder, FeaturePriceVersionBuilder } from '../../../../test/builders/billing';
import { FixedClock } from '../../../../test/infrastructure/fixed-clock';
import { InMemoryFeaturePriceRepository } from '../../../../test/repositories/billing/in-memory-feature-price.repository';
import { ListSelectablePricesUseCase } from '../../application/use-cases/list-selectable-prices.use-case';
import { InternalBillingPricesController } from './internal-billing-prices.controller';

// A real use case over the in-memory repository, not a double: the controller is a thin forwarder,
// so what matters is that the query value reaches the use case and its errors become the right
// HTTP status.
function build(): {
  controller: InternalBillingPricesController;
  repo: InMemoryFeaturePriceRepository;
} {
  const repo = new InMemoryFeaturePriceRepository();
  const useCase = new ListSelectablePricesUseCase(
    repo,
    new FixedClock(new Date('2026-03-15T12:00:00Z')),
  );
  return { controller: new InternalBillingPricesController(useCase), repo };
}

describe('InternalBillingPricesController', () => {
  it('returns the prices of a supported country', async () => {
    const { controller, repo } = build();
    repo.seed(
      new FeaturePriceBuilder()
        .withVersions([new FeaturePriceVersionBuilder().withAmountMinor(4900).build()])
        .build(),
    );

    await expect(controller.list('BR')).resolves.toMatchObject({
      offered: true,
      countryCode: 'BR',
      prices: [{ featureKey: 'HOTSITE', amountMinor: 4900 }],
    });
  });

  it('answers not offered for the US and for an unknown country, as a 200 body not an error', async () => {
    const { controller } = build();

    await expect(controller.list('US')).resolves.toEqual({ offered: false });
    await expect(controller.list('ZZ')).resolves.toEqual({ offered: false });
  });

  it.each([['B1'], ['BRA'], [undefined]])(
    'maps a malformed or missing country (%s) to 400 COUNTRY_CODE_FORMAT_INVALID',
    async (country) => {
      const { controller } = build();

      const error: unknown = await controller.list(country).catch((err: unknown) => err);

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect((error as HttpException).getResponse()).toMatchObject({
        code: CountryCodeErrorCode.FORMAT_INVALID,
      });
    },
  );

  it('is mounted at its own internal path', () => {
    expect(Reflect.getMetadata('path', InternalBillingPricesController)).toBe(
      'internal/billing/public-prices',
    );
  });
});
