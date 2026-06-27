import { Money } from '../../../../shared/value-objects/money';
import { ServiceBuilder } from '../../../../test/builders/booking/index';
import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import { GetServicesUseCase } from './get-services.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const TENANT_B = '10000000-0000-4000-8000-000000000002';

describe('GetServicesUseCase', () => {
  let repo: InMemoryServiceRepository;
  let useCase: GetServicesUseCase;

  beforeEach(() => {
    repo = new InMemoryServiceRepository();
    useCase = new GetServicesUseCase(repo);
  });

  it('returns only active services when status filter is ACTIVE', async () => {
    const active = new ServiceBuilder().withTenantId(TENANT_A).withName('Ativo').build();
    const inactive = new ServiceBuilder().withTenantId(TENANT_A).withName('Inativo').build();
    inactive.deactivate();
    await repo.save(active);
    await repo.save(inactive);

    const result = await useCase.execute({ tenantId: TENANT_A, status: 'ACTIVE' });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe('Ativo');
  });

  it('returns active and inactive services when status filter is ANY', async () => {
    const active = new ServiceBuilder().withTenantId(TENANT_A).withName('Ativo').build();
    const inactive = new ServiceBuilder().withTenantId(TENANT_A).withName('Inativo').build();
    inactive.deactivate();
    await repo.save(active);
    await repo.save(inactive);

    const result = await useCase.execute({ tenantId: TENANT_A, status: 'ANY' });

    expect(result.items.map((item) => item.name).sort()).toEqual(['Ativo', 'Inativo']);
  });

  it('filters by ids', async () => {
    const included = new ServiceBuilder().withTenantId(TENANT_A).withName('Incluido').build();
    const other = new ServiceBuilder().withTenantId(TENANT_A).withName('Outro').build();
    await repo.save(included);
    await repo.save(other);

    const result = await useCase.execute({ tenantId: TENANT_A, ids: [included.id] });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe(included.id);
  });

  it('filters by search', async () => {
    await repo.save(
      new ServiceBuilder().withTenantId(TENANT_A).withName('Lavagem Simples').build(),
    );
    await repo.save(new ServiceBuilder().withTenantId(TENANT_A).withName('Cristalizacao').build());

    const result = await useCase.execute({ tenantId: TENANT_A, search: 'lava' });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe('Lavagem Simples');
  });

  it('returns price with requested locale formatting', async () => {
    const service = new ServiceBuilder()
      .withTenantId(TENANT_A)
      .withPrice(Money.from(150, 'BRL'))
      .build();
    await repo.save(service);

    const result = await useCase.execute({ tenantId: TENANT_A, locale: 'pt-BR' });

    expect(result.items[0].price.formatted).toBe('R$\u00A0150,00');
    expect(result.items[0].price.currency).toBe('BRL');
  });

  it('tenant isolation: does not return services from another tenant', async () => {
    const serviceA = new ServiceBuilder().withTenantId(TENANT_A).build();
    const serviceB = new ServiceBuilder().withTenantId(TENANT_B).build();
    await repo.save(serviceA);
    await repo.save(serviceB);

    const result = await useCase.execute({ tenantId: TENANT_A });

    expect(result.items.every((item) => item.id !== serviceB.id)).toBe(true);
  });
});
