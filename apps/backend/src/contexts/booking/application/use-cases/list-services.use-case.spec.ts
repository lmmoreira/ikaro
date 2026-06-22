import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import { ServiceBuilder } from '../../../../test/builders/booking/index';
import { RequestContextBuilder } from '../../../../test/factories/request-context.factory';
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
      new RequestContextBuilder().withTenantId(TENANT_A).build(),
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

    expect(result.items[0].price.formatted).toBe('R$\u00A0150,00');
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

  describe('STAFF/MANAGER role', () => {
    it.each(['STAFF', 'MANAGER'])('returns inactive services too for %s', async (role) => {
      const staffUseCase = new ListServicesUseCase(
        repo,
        new RequestContextBuilder().withTenantId(TENANT_A).withActorRole(role).build(),
      );
      const active = new ServiceBuilder().withTenantId(TENANT_A).withName('Ativo').build();
      const inactive = new ServiceBuilder().withTenantId(TENANT_A).withName('Inativo').build();
      inactive.deactivate();
      await repo.save(active);
      await repo.save(inactive);

      const result = await staffUseCase.execute();

      expect(result.items).toHaveLength(2);
      expect(result.items.map((i) => i.name).sort()).toEqual(['Ativo', 'Inativo']);
    });
  });

  describe('no actor role (public/guest)', () => {
    it('returns only active services', async () => {
      const active = new ServiceBuilder().withTenantId(TENANT_A).withName('Ativo').build();
      const inactive = new ServiceBuilder().withTenantId(TENANT_A).withName('Inativo').build();
      inactive.deactivate();
      await repo.save(active);
      await repo.save(inactive);

      const result = await useCase.execute();

      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('Ativo');
    });
  });
});
