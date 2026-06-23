import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryTenantRepository } from '../../../../test/repositories/platform/in-memory-tenant.repository';
import { TenantBuilder } from '../../../../test/builders/platform/index';
import {
  TenantInactiveError,
  TenantNotFoundError,
} from '../../domain/errors/platform-domain.error';
import { RenameTenantUseCase } from './rename-tenant.use-case';

describe('RenameTenantUseCase', () => {
  let tenantRepo: InMemoryTenantRepository;
  let useCase: RenameTenantUseCase;

  beforeEach(() => {
    tenantRepo = new InMemoryTenantRepository();
    useCase = new RenameTenantUseCase(tenantRepo, new InMemoryTransactionManager());
  });

  it('throws TenantNotFoundError when the tenant does not exist', async () => {
    await expect(useCase.execute('non-existent-id', { name: 'Novo Nome' })).rejects.toThrow(
      TenantNotFoundError,
    );
  });

  it('updates the tenant name', async () => {
    const tenant = new TenantBuilder().build();
    await tenantRepo.save(tenant);

    const result = await useCase.execute(tenant.id, { name: 'Novo Nome Lavacar' });

    expect(result.name).toBe('Novo Nome Lavacar');
    const saved = await tenantRepo.findById(tenant.id);
    expect(saved!.name).toBe('Novo Nome Lavacar');
  });

  it('tenant isolation — renaming tenant A does not affect tenant B', async () => {
    const tenantA = new TenantBuilder().withSlug('rename-iso-a').build();
    const tenantB = new TenantBuilder().withSlug('rename-iso-b').build();
    await tenantRepo.save(tenantA);
    await tenantRepo.save(tenantB);

    await useCase.execute(tenantA.id, { name: 'Tenant A Renamed' });

    const reloadedB = await tenantRepo.findById(tenantB.id);
    expect(reloadedB!.name).not.toBe('Tenant A Renamed');
  });

  it('throws TenantInactiveError when renaming an inactive tenant', async () => {
    const tenant = new TenantBuilder().withSlug('inactive-name').build();
    tenant.deactivate();
    await tenantRepo.save(tenant);

    await expect(useCase.execute(tenant.id, { name: 'Novo Nome' })).rejects.toThrow(
      TenantInactiveError,
    );
  });
});
