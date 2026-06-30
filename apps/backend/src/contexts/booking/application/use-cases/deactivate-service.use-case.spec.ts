import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import { ServiceBuilder } from '../../../../test/builders/booking/index';
import { ServiceNotFoundError } from '../../domain/errors/booking-domain.error';
import { DeactivateServiceUseCase } from './deactivate-service.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const TENANT_B = '10000000-0000-4000-8000-000000000002';

describe('DeactivateServiceUseCase', () => {
  let repo: InMemoryServiceRepository;
  let useCase: DeactivateServiceUseCase;

  beforeEach(() => {
    repo = new InMemoryServiceRepository();
    useCase = new DeactivateServiceUseCase(repo, new InMemoryTransactionManager());
  });

  it('sets isActive=false and returns { id, isActive: false }', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).build();
    await repo.save(service);

    const result = await useCase.execute({ id: service.id, tenantId: TENANT_A });

    expect(result.id).toBe(service.id);
    expect(result.isActive).toBe(false);

    const persisted = await repo.findById(service.id, TENANT_A);
    expect(persisted!.isActive).toBe(false);
  });

  it('does NOT delete the row from the repository', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).build();
    await repo.save(service);

    await useCase.execute({ id: service.id, tenantId: TENANT_A });

    const persisted = await repo.findById(service.id, TENANT_A);
    expect(persisted).not.toBeNull();
  });

  it('throws ServiceNotFoundError when service does not exist', async () => {
    await expect(useCase.execute({ id: 'non-existent-id', tenantId: TENANT_A })).rejects.toThrow(
      ServiceNotFoundError,
    );
  });

  it('throws ServiceNotFoundError when service belongs to a different tenant', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_B).build();
    await repo.save(service);

    await expect(useCase.execute({ id: service.id, tenantId: TENANT_A })).rejects.toThrow(
      ServiceNotFoundError,
    );
  });

  it('is idempotent — deactivating an already-deactivated service does not throw', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).build();
    service.deactivate();
    await repo.save(service);

    const result = await useCase.execute({ id: service.id, tenantId: TENANT_A });
    expect(result.isActive).toBe(false);
  });
});
