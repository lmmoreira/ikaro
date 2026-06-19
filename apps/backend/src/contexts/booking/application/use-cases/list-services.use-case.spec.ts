import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import { InMemoryTenantLocalizationPort } from '../../../../test/infrastructure/in-memory-tenant-localization.port';
import { ServiceBuilder } from '../../../../test/builders/booking/index';
import { TenantContextBuilder } from '../../../../test/factories/tenant-context.factory';
import { Money } from '../../../../shared/value-objects/money';
import { ListServicesUseCase } from './list-services.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const TENANT_B = '10000000-0000-4000-8000-000000000002';

describe('ListServicesUseCase', () => {
  let repo: InMemoryServiceRepository;
  let useCase: ListServicesUseCase;

  beforeEach(() => {
    repo = new InMemoryServiceRepository();
    useCase = new ListServicesUseCase(
      repo,
      new InMemoryTenantLocalizationPort(),
      new TenantContextBuilder().withTenantId(TENANT_A).build(),
    );
  });

  it('returns only active services for the tenant', async () => {
    const active = new ServiceBuilder().withTenantId(TENANT_A).withName('Ativo').build();
    const inactive = new ServiceBuilder().withTenantId(TENANT_A).withName('Inativo').build();
    inactive.deactivate();
    await repo.save(active);
    await repo.save(inactive);

    const result = await useCase.execute();

    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe('Ativo');
    expect(result.items[0].isActive).toBe(true);
  });

  it('returns empty list when tenant has no active services', async () => {
    const result = await useCase.execute();
    expect(result.items).toHaveLength(0);
  });

  it('returns price with pt-BR formatted string', async () => {
    const service = new ServiceBuilder()
      .withTenantId(TENANT_A)
      .withPrice(Money.from(150, 'BRL'))
      .build();
    await repo.save(service);

    const result = await useCase.execute();

    expect(result.items[0].price.formatted).toBe('R$ 150,00');
    expect(result.items[0].price.currency).toBe('BRL');
  });

  it('tenant isolation: does not return services from another tenant', async () => {
    const serviceA = new ServiceBuilder().withTenantId(TENANT_A).build();
    const serviceB = new ServiceBuilder().withTenantId(TENANT_B).build();
    await repo.save(serviceA);
    await repo.save(serviceB);

    const result = await useCase.execute();

    expect(result.items.every((i) => i.id !== serviceB.id)).toBe(true);
  });
});
