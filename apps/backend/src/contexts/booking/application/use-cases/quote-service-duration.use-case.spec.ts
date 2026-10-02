import { ServiceBuilder } from '../../../../test/builders/booking/index';
import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import { Money } from '../../../../shared/value-objects/money';
import {
  BookingDurationOutOfRangeError,
  ServiceNotFoundError,
} from '../../domain/errors/booking-domain.error';
import { BookingQuoteService } from '../services/booking-quote.service';
import { QuoteServiceDurationUseCase } from './quote-service-duration.use-case';

const TENANT_A = '10000000-0000-4000-8000-0000000029b1';
const TENANT_B = '10000000-0000-4000-8000-0000000029b2';

const perTimePolicy = {
  durationPolicy: 'CUSTOMER_SELECTED' as const,
  durationMinMinutes: 60,
  durationMaxMinutes: 240,
  durationIncrementMinutes: 30,
  pricingPolicy: 'PER_TIME_INCREMENT' as const,
  pricingIncrementMinutes: 60,
  pricePerIncrementAmount: 50,
  minimumChargeAmount: 80,
};

describe('QuoteServiceDurationUseCase', () => {
  let serviceRepo: InMemoryServiceRepository;
  let useCase: QuoteServiceDurationUseCase;

  const seedPerTimeService = async () => {
    const service = new ServiceBuilder()
      .withTenantId(TENANT_A)
      .withPrice(Money.from(0, 'BRL'))
      .withBookingPolicy(perTimePolicy)
      .build();
    await serviceRepo.save(service);
    return service;
  };

  beforeEach(() => {
    serviceRepo = new InMemoryServiceRepository();
    useCase = new QuoteServiceDurationUseCase(serviceRepo, new BookingQuoteService());
  });

  it('prices per increment and maps Money to { amount, currency }', async () => {
    const service = await seedPerTimeService();

    const result = await useCase.execute({
      id: service.id,
      tenantId: TENANT_A,
      durationMinutes: 150,
    });

    // 150 min → ceil(150/60) = 3 increments → 3 × 50
    expect(result).toEqual({ durationMinutes: 150, price: { amount: 150, currency: 'BRL' } });
  });

  it('applies the minimum-charge floor', async () => {
    const service = await seedPerTimeService();

    const result = await useCase.execute({
      id: service.id,
      tenantId: TENANT_A,
      durationMinutes: 60,
    });

    expect(result.price.amount).toBe(80);
  });

  it.each([60, 240])('accepts the boundary duration %i', async (durationMinutes) => {
    const service = await seedPerTimeService();

    const result = await useCase.execute({ id: service.id, tenantId: TENANT_A, durationMinutes });

    expect(result.durationMinutes).toBe(durationMinutes);
  });

  it.each([
    ['below the minimum', 30],
    ['above the maximum', 270],
    ['off the increment grid', 70],
    ['missing', undefined],
  ])('throws BookingDurationOutOfRangeError for a duration %s', async (_label, durationMinutes) => {
    const service = await seedPerTimeService();

    await expect(
      useCase.execute({ id: service.id, tenantId: TENANT_A, durationMinutes }),
    ).rejects.toBeInstanceOf(BookingDurationOutOfRangeError);
  });

  it('a FIXED service ignores durationMinutes and returns its own price and duration', async () => {
    const service = new ServiceBuilder()
      .withTenantId(TENANT_A)
      .withDurationMinutes(45)
      .withPrice(Money.from(120, 'BRL'))
      .build();
    await serviceRepo.save(service);

    const result = await useCase.execute({
      id: service.id,
      tenantId: TENANT_A,
      durationMinutes: 999,
    });

    expect(result).toEqual({ durationMinutes: 45, price: { amount: 120, currency: 'BRL' } });
  });

  it('throws ServiceNotFoundError for an unknown or inactive service', async () => {
    const inactive = new ServiceBuilder().withTenantId(TENANT_A).withIsActive(false).build();
    await serviceRepo.save(inactive);

    await expect(
      useCase.execute({ id: '00000000-0000-4000-8000-000000009999', tenantId: TENANT_A }),
    ).rejects.toBeInstanceOf(ServiceNotFoundError);
    await expect(useCase.execute({ id: inactive.id, tenantId: TENANT_A })).rejects.toBeInstanceOf(
      ServiceNotFoundError,
    );
  });

  it('tenant isolation: a service of tenant A is not found under tenant B', async () => {
    const service = await seedPerTimeService();

    await expect(
      useCase.execute({ id: service.id, tenantId: TENANT_B, durationMinutes: 60 }),
    ).rejects.toBeInstanceOf(ServiceNotFoundError);
  });
});
