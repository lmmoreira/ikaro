import { HttpException, HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryTenantRepository } from '../../../../test/repositories/platform/in-memory-tenant.repository';
import { TenantBuilder } from '../../../../test/builders/platform/index';
import { RequestContext } from '../../../../shared/request/request-context';
import { TRANSACTION_MANAGER } from '../../../../shared/ports/transaction-manager.port';
import { TENANT_REPOSITORY } from '../../application/ports/tenant-repository.port';
import { UpdateTenantSettingsUseCase } from '../../application/use-cases/update-tenant-settings.use-case';
import { GetTenantByIdUseCase } from '../../application/use-cases/get-tenant-by-id.use-case';
import { TenantSettingsController } from './tenant-settings.controller';

describe('TenantSettingsController', () => {
  let controller: TenantSettingsController;
  let tenantRepo: InMemoryTenantRepository;
  let tenantContext: { tenantId: string };

  beforeEach(async () => {
    tenantRepo = new InMemoryTenantRepository();
    tenantContext = { tenantId: '' };

    const moduleRef = await Test.createTestingModule({
      controllers: [TenantSettingsController],
      providers: [
        GetTenantByIdUseCase,
        UpdateTenantSettingsUseCase,
        { provide: TENANT_REPOSITORY, useValue: tenantRepo },
        { provide: RequestContext, useValue: tenantContext },
        { provide: TRANSACTION_MANAGER, useValue: new InMemoryTransactionManager() },
      ],
    }).compile();

    controller = moduleRef.get(TenantSettingsController);
  });

  describe('getSettings', () => {
    it('returns the tenant settings with tenantId/name/slug/settings', async () => {
      const tenant = new TenantBuilder().withSlug('ctrl-settings-get-01').build();
      await tenantRepo.save(tenant);
      tenantContext.tenantId = tenant.id;

      const result = await controller.getSettings();

      expect(result.tenantId).toBe(tenant.id);
      expect(result.slug).toBe('ctrl-settings-get-01');
      expect(result.name).toBe(tenant.name);
      expect(result.settings.loyalty).toBeDefined();
    });

    it('maps TenantNotFoundError to 404 HttpException', async () => {
      tenantContext.tenantId = 'non-existent-id';

      expect.assertions(2);
      try {
        await controller.getSettings();
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
      }
    });
  });

  it('updates settings and returns the updated result', async () => {
    const tenant = new TenantBuilder().withSlug('ctrl-settings-01').build();
    await tenantRepo.save(tenant);
    tenantContext.tenantId = tenant.id;

    const result = await controller.updateSettings({
      settings: { loyalty: { expiryDays: 365 } },
    });

    expect(result.settings.loyalty.expiryDays).toBe(365);
    expect(result.settings.loyalty.enableNotifications).toBe(true);
    expect(result.tenantId).toBe(tenant.id);
  });

  it('maps TenantNotFoundError to 404 HttpException', async () => {
    tenantContext.tenantId = 'non-existent-id';

    expect.assertions(2);
    try {
      await controller.updateSettings({ settings: { loyalty: { expiryDays: 90 } } });
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    }
  });

  it('maps PlatformDomainError to 400 HttpException for invalid settings', async () => {
    const tenant = new TenantBuilder().withSlug('ctrl-settings-03').build();
    await tenantRepo.save(tenant);
    tenantContext.tenantId = tenant.id;

    expect.assertions(2);
    try {
      await controller.updateSettings({
        settings: { businessHours: { timezone: 'Not/AZone' } },
      });
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    }
  });

  it('maps TenantInactiveError to 409 HttpException', async () => {
    const tenant = new TenantBuilder().withSlug('ctrl-settings-04').build();
    tenant.deactivate();
    await tenantRepo.save(tenant);
    tenantContext.tenantId = tenant.id;

    expect.assertions(2);
    try {
      await controller.updateSettings({ settings: { loyalty: { expiryDays: 90 } } });
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.CONFLICT);
    }
  });
});
