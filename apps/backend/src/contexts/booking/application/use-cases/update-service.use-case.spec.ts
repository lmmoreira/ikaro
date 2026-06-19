import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import { InMemoryTenantLocalizationPort } from '../../../../test/infrastructure/in-memory-tenant-localization.port';
import { ServiceBuilder } from '../../../../test/builders/booking/index';
import { TenantContextBuilder } from '../../../../test/factories/tenant-context.factory';
import {
  BookingDomainError,
  ServiceDeactivatedError,
  ServiceNotFoundError,
} from '../../domain/errors/booking-domain.error';
import { UpdateServiceUseCase } from './update-service.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const TENANT_B = '10000000-0000-4000-8000-000000000002';

describe('UpdateServiceUseCase', () => {
  let repo: InMemoryServiceRepository;
  let useCase: UpdateServiceUseCase;

  beforeEach(() => {
    repo = new InMemoryServiceRepository();
    useCase = new UpdateServiceUseCase(
      repo,
      new InMemoryTransactionManager(),
      new InMemoryTenantLocalizationPort(),
      new TenantContextBuilder().withTenantId(TENANT_A).build(),
    );
  });

  it('updates only the provided fields; unspecified fields remain unchanged', async () => {
    const service = new ServiceBuilder()
      .withTenantId(TENANT_A)
      .withName('Original')
      .withDurationMinutes(30)
      .withLoyaltyPointsValue(5)
      .build();
    await repo.save(service);

    const result = await useCase.execute(service.id, { name: 'Novo Nome' });

    expect(result.name).toBe('Novo Nome');
    expect(result.durationMinutes).toBe(30);
    expect(result.loyaltyPointsValue).toBe(5);
  });

  it('clears description when description is explicitly null', async () => {
    const service = new ServiceBuilder()
      .withTenantId(TENANT_A)
      .withDescription('Desc original')
      .build();
    await repo.save(service);

    const result = await useCase.execute(service.id, { description: null });

    expect(result.description).toBeNull();
  });

  it('preserves description when description is omitted from dto', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).withDescription('Mantida').build();
    await repo.save(service);

    const result = await useCase.execute(service.id, { name: 'Novo Nome' });

    expect(result.description).toBe('Mantida');
  });

  it('returns full DTO with pt-BR formatted price', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).build();
    await repo.save(service);

    const result = await useCase.execute(service.id, { name: 'Lavagem Premium' });

    expect(result.price.formatted).toMatch(/^R\$/);
    expect(result.isActive).toBe(true);
  });

  it('throws ServiceNotFoundError when service does not exist', async () => {
    await expect(useCase.execute('non-existent-id', { name: 'X' })).rejects.toThrow(
      ServiceNotFoundError,
    );
  });

  it('throws ServiceNotFoundError when service belongs to a different tenant', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_B).build();
    await repo.save(service);

    await expect(useCase.execute(service.id, { name: 'X' })).rejects.toThrow(ServiceNotFoundError);
  });

  it('throws ServiceDeactivatedError when updating a deactivated service', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).build();
    service.deactivate();
    await repo.save(service);

    await expect(useCase.execute(service.id, { name: 'X' })).rejects.toThrow(
      ServiceDeactivatedError,
    );
  });

  it('throws BookingDomainError when updated price is zero', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).build();
    await repo.save(service);

    await expect(useCase.execute(service.id, { priceAmount: 0 })).rejects.toThrow(
      BookingDomainError,
    );
  });
});
