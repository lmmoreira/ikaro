import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import { InMemoryTenantLocalizationPort } from '../../../../test/infrastructure/in-memory-tenant-localization.port';
import { TenantContextBuilder } from '../../../../test/factories/tenant-context.factory';
import { BookingDomainError } from '../../domain/errors/booking-domain.error';
import { CreateServiceUseCase } from './create-service.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const TENANT_B = '10000000-0000-4000-8000-000000000002';
const CORRELATION_ID = 'corr-create-svc-test';

const baseDto = {
  name: 'Lavagem Completa',
  description: 'Lavagem exterior e interior',
  priceAmount: 150,
  durationMinutes: 60,
  loyaltyPointsValue: 10,
  requiresPickupAddress: false,
};

describe('CreateServiceUseCase', () => {
  let repo: InMemoryServiceRepository;
  let useCase: CreateServiceUseCase;

  beforeEach(() => {
    repo = new InMemoryServiceRepository();
    useCase = new CreateServiceUseCase(
      repo,
      new InMemoryTransactionManager(),
      new InMemoryTenantLocalizationPort(),
      new TenantContextBuilder()
        .withTenantId(TENANT_A)
        .withCorrelationId(CORRELATION_ID)
        .withActorId('20000000-0000-4000-8000-000000000001')
        .withActorType('STAFF')
        .withActorRole('MANAGER')
        .build(),
    );
  });

  it('creates a service and returns the full result DTO', async () => {
    const result = await useCase.execute(baseDto);

    expect(result.id).toBeDefined();
    expect(result.name).toBe('Lavagem Completa');
    expect(result.description).toBe('Lavagem exterior e interior');
    expect(result.price.amount).toBe(150);
    expect(result.price.currency).toBe('BRL');
    expect(result.price.formatted).toBe('R$ 150,00');
    expect(result.durationMinutes).toBe(60);
    expect(result.loyaltyPointsValue).toBe(10);
    expect(result.requiresPickupAddress).toBe(false);
    expect(result.isActive).toBe(true);
    expect(result.createdAt).toBeDefined();
  });

  it('persists the service scoped to TenantContext tenantId', async () => {
    const result = await useCase.execute(baseDto);

    const saved = await repo.findById(result.id, TENANT_A);
    expect(saved).not.toBeNull();
    expect(saved!.tenantId).toBe(TENANT_A);
  });

  it('service is not visible to a different tenant', async () => {
    const result = await useCase.execute(baseDto);

    const fromOtherTenant = await repo.findById(result.id, TENANT_B);
    expect(fromOtherTenant).toBeNull();
  });

  it('defaults requiresPickupAddress to false when omitted', async () => {
    const result = await useCase.execute({
      name: baseDto.name,
      priceAmount: baseDto.priceAmount,
      durationMinutes: baseDto.durationMinutes,
      loyaltyPointsValue: baseDto.loyaltyPointsValue,
    });
    expect(result.requiresPickupAddress).toBe(false);
  });

  it('allows loyaltyPointsValue of zero', async () => {
    const result = await useCase.execute({ ...baseDto, loyaltyPointsValue: 0 });
    expect(result.loyaltyPointsValue).toBe(0);
  });

  it('throws BookingDomainError when priceAmount is zero', async () => {
    await expect(useCase.execute({ ...baseDto, priceAmount: 0 })).rejects.toThrow(
      BookingDomainError,
    );
  });

  it('throws BookingDomainError when durationMinutes is zero', async () => {
    await expect(useCase.execute({ ...baseDto, durationMinutes: 0 })).rejects.toThrow(
      BookingDomainError,
    );
  });

  it('throws BookingDomainError when loyaltyPointsValue is negative', async () => {
    await expect(useCase.execute({ ...baseDto, loyaltyPointsValue: -1 })).rejects.toThrow(
      BookingDomainError,
    );
  });
});
