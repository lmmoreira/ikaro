import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import { ServiceBuilder } from '../../../../test/builders/booking/index';
import { ServiceNotFoundError } from '../../domain/errors/booking-domain.error';
import { GetServiceByIdUseCase } from './get-service-by-id.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const TENANT_B = '10000000-0000-4000-8000-000000000002';

describe('GetServiceByIdUseCase', () => {
  let repo: InMemoryServiceRepository;
  let useCase: GetServiceByIdUseCase;

  beforeEach(() => {
    repo = new InMemoryServiceRepository();
    useCase = new GetServiceByIdUseCase(repo);
  });

  it('returns the service with pt-BR formatted price', async () => {
    const service = new ServiceBuilder()
      .withTenantId(TENANT_A)
      .withName('Lavagem Completa')
      .build();
    await repo.save(service);

    const result = await useCase.execute({ id: service.id, tenantId: TENANT_A, locale: 'pt-BR' });

    expect(result.id).toBe(service.id);
    expect(result.name).toBe('Lavagem Completa');
    expect(result.price.formatted).toMatch(/^R\$/);
  });

  it('returns an inactive service (staff can view deactivated services)', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).build();
    service.deactivate();
    await repo.save(service);

    const result = await useCase.execute({ id: service.id, tenantId: TENANT_A, locale: 'pt-BR' });

    expect(result.isActive).toBe(false);
  });

  it('throws ServiceNotFoundError when service does not exist', async () => {
    await expect(
      useCase.execute({ id: 'non-existent-id', tenantId: TENANT_A, locale: 'pt-BR' }),
    ).rejects.toBeInstanceOf(ServiceNotFoundError);
  });

  it('tenant isolation: throws ServiceNotFoundError when service belongs to a different tenant', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_B).build();
    await repo.save(service);

    await expect(
      useCase.execute({ id: service.id, tenantId: TENANT_A, locale: 'pt-BR' }),
    ).rejects.toBeInstanceOf(ServiceNotFoundError);
  });
});
