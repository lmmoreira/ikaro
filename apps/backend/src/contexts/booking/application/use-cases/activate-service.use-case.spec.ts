import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { ServiceBuilder } from '../../../../test/builders/booking/index';
import { RequestContextBuilder } from '../../../../test/factories/request-context.factory';
import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import { ServiceNotFoundError } from '../../domain/errors/booking-domain.error';
import { ActivateServiceUseCase } from './activate-service.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const TENANT_B = '10000000-0000-4000-8000-000000000002';

describe('ActivateServiceUseCase', () => {
  let repo: InMemoryServiceRepository;
  let useCase: ActivateServiceUseCase;

  beforeEach(() => {
    repo = new InMemoryServiceRepository();
    useCase = new ActivateServiceUseCase(
      repo,
      new InMemoryTransactionManager(),
      new RequestContextBuilder().withTenantId(TENANT_A).build(),
    );
  });

  it('sets isActive=true and returns { id, isActive: true }', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).build();
    service.deactivate();
    await repo.save(service);

    const result = await useCase.execute(service.id);

    expect(result.id).toBe(service.id);
    expect(result.isActive).toBe(true);

    const persisted = await repo.findById(service.id, TENANT_A);
    expect(persisted!.isActive).toBe(true);
  });

  it('does NOT delete the row from the repository', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).build();
    service.deactivate();
    await repo.save(service);

    await useCase.execute(service.id);

    const persisted = await repo.findById(service.id, TENANT_A);
    expect(persisted).not.toBeNull();
  });

  it('throws ServiceNotFoundError when service does not exist', async () => {
    await expect(useCase.execute('non-existent-id')).rejects.toThrow(ServiceNotFoundError);
  });

  it('throws ServiceNotFoundError when service belongs to a different tenant', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_B).build();
    service.deactivate();
    await repo.save(service);

    await expect(useCase.execute(service.id)).rejects.toThrow(ServiceNotFoundError);
  });

  it('is idempotent — activating an already-active service does not throw', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).build();
    await repo.save(service);

    const result = await useCase.execute(service.id);
    expect(result.isActive).toBe(true);
  });
});
