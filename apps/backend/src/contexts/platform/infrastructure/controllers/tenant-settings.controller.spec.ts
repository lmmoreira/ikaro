import { HttpException, HttpStatus } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { InMemoryTenantRepository } from '../../../../test/repositories/platform/in-memory-tenant.repository';
import { TenantBuilder } from '../../../../test/builders/platform/index';
import { TenantContext } from '../../../../shared/tenant/tenant-context';
import { TENANT_REPOSITORY } from '../../application/ports/tenant-repository.port';
import { UpdateTenantSettingsUseCase } from '../../application/use-cases/update-tenant-settings.use-case';
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
        UpdateTenantSettingsUseCase,
        { provide: TENANT_REPOSITORY, useValue: tenantRepo },
        { provide: TenantContext, useValue: tenantContext },
      ],
    }).compile();

    controller = moduleRef.get(TenantSettingsController);
  });

  it('updates settings and returns the updated result', async () => {
    const tenant = new TenantBuilder().withSlug('ctrl-settings-01').build();
    await tenantRepo.save(tenant);
    tenantContext.tenantId = tenant.id;

    const result = await controller.updateSettings({
      settings: { loyalty: { expiry_days: 365 } },
    });

    expect(result.settings.loyalty.expiry_days).toBe(365);
    expect(result.settings.loyalty.enable_notifications).toBe(true);
    expect(result.tenantId).toBe(tenant.id);
  });

  it('updates the tenant name', async () => {
    const tenant = new TenantBuilder().withSlug('ctrl-settings-02').build();
    await tenantRepo.save(tenant);
    tenantContext.tenantId = tenant.id;

    const result = await controller.updateSettings({ name: 'Novo Nome' });

    expect(result.name).toBe('Novo Nome');
  });

  it('maps TenantNotFoundError to 404 HttpException', async () => {
    tenantContext.tenantId = 'non-existent-id';

    expect.assertions(2);
    try {
      await controller.updateSettings({ settings: { loyalty: { expiry_days: 90 } } });
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
        settings: { business_hours: { timezone: 'Not/AZone' } },
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
      await controller.updateSettings({ settings: { loyalty: { expiry_days: 90 } } });
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.CONFLICT);
    }
  });
});
