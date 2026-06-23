import { HttpException, HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryTenantRepository } from '../../../../test/repositories/platform/in-memory-tenant.repository';
import { TenantBuilder } from '../../../../test/builders/platform/index';
import { RequestContext } from '../../../../shared/request/request-context';
import { TRANSACTION_MANAGER } from '../../../../shared/ports/transaction-manager.port';
import { TENANT_REPOSITORY } from '../../application/ports/tenant-repository.port';
import { RenameTenantUseCase } from '../../application/use-cases/rename-tenant.use-case';
import { TenantController } from './tenant.controller';

describe('TenantController', () => {
  let controller: TenantController;
  let tenantRepo: InMemoryTenantRepository;
  let tenantContext: { tenantId: string };

  beforeEach(async () => {
    tenantRepo = new InMemoryTenantRepository();
    tenantContext = { tenantId: '' };

    const moduleRef = await Test.createTestingModule({
      controllers: [TenantController],
      providers: [
        RenameTenantUseCase,
        { provide: TENANT_REPOSITORY, useValue: tenantRepo },
        { provide: RequestContext, useValue: tenantContext },
        { provide: TRANSACTION_MANAGER, useValue: new InMemoryTransactionManager() },
      ],
    }).compile();

    controller = moduleRef.get(TenantController);
  });

  it('renames the tenant and returns the updated result', async () => {
    const tenant = new TenantBuilder().withSlug('ctrl-rename-01').build();
    await tenantRepo.save(tenant);
    tenantContext.tenantId = tenant.id;

    const result = await controller.rename({ name: 'Novo Nome' });

    expect(result.tenantId).toBe(tenant.id);
    expect(result.name).toBe('Novo Nome');
  });

  it('maps TenantNotFoundError to 404 HttpException', async () => {
    tenantContext.tenantId = 'non-existent-id';

    expect.assertions(2);
    try {
      await controller.rename({ name: 'Novo Nome' });
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    }
  });

  it('maps TenantInactiveError to 409 HttpException', async () => {
    const tenant = new TenantBuilder().withSlug('ctrl-rename-02').build();
    tenant.deactivate();
    await tenantRepo.save(tenant);
    tenantContext.tenantId = tenant.id;

    expect.assertions(2);
    try {
      await controller.rename({ name: 'Novo Nome' });
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.CONFLICT);
    }
  });
});
