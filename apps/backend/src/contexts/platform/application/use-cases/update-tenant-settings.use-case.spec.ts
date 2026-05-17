import { InMemoryTenantRepository } from '../../../../test/repositories/platform/in-memory-tenant.repository';
import { TenantBuilder } from '../../../../test/builders/platform/index';
import {
  PlatformDomainError,
  TenantInactiveError,
  TenantNotFoundError,
} from '../../domain/errors/platform-domain.error';
import { UpdateTenantSettingsUseCase } from './update-tenant-settings.use-case';

describe('UpdateTenantSettingsUseCase', () => {
  let tenantRepo: InMemoryTenantRepository;
  let useCase: UpdateTenantSettingsUseCase;

  beforeEach(() => {
    tenantRepo = new InMemoryTenantRepository();
    useCase = new UpdateTenantSettingsUseCase(tenantRepo);
  });

  it('throws TenantNotFoundError when the tenant does not exist', async () => {
    await expect(
      useCase.execute('non-existent-id', { settings: { loyalty: { expiry_days: 90 } } }),
    ).rejects.toThrow(TenantNotFoundError);
  });

  it('merges partial loyalty settings without wiping other fields', async () => {
    const tenant = new TenantBuilder().build();
    await tenantRepo.save(tenant);

    const result = await useCase.execute(tenant.id, {
      settings: { loyalty: { expiry_days: 90 } },
    });

    expect(result.settings.loyalty.expiry_days).toBe(90);
    expect(result.settings.loyalty.enable_notifications).toBe(true);
    expect(result.settings.loyalty.expiry_warning_days).toBe(7);
    expect(result.settings.booking.cancellation_window_hours).toBe(48);
  });

  it('merges partial booking settings without touching loyalty or business_hours', async () => {
    const tenant = new TenantBuilder().build();
    await tenantRepo.save(tenant);

    const result = await useCase.execute(tenant.id, {
      settings: { booking: { cancellation_window_hours: 24 } },
    });

    expect(result.settings.booking.cancellation_window_hours).toBe(24);
    expect(result.settings.booking.max_booking_advance_days).toBe(90);
    expect(result.settings.loyalty.expiry_days).toBe(180);
  });

  it('updates business_hours timezone and keeps existing day hours', async () => {
    const tenant = new TenantBuilder().build();
    await tenantRepo.save(tenant);

    const result = await useCase.execute(tenant.id, {
      settings: { business_hours: { timezone: 'America/Manaus' } },
    });

    expect(result.settings.business_hours.timezone).toBe('America/Manaus');
    expect(result.settings.business_hours.monday).toEqual({ open: '09:00', close: '18:00' });
  });

  it('closes a day by setting it to null', async () => {
    const tenant = new TenantBuilder().build();
    await tenantRepo.save(tenant);

    const result = await useCase.execute(tenant.id, {
      settings: { business_hours: { saturday: null } },
    });

    expect(result.settings.business_hours.saturday).toBeNull();
    expect(result.settings.business_hours.monday).toEqual({ open: '09:00', close: '18:00' });
  });

  it('updates the tenant name', async () => {
    const tenant = new TenantBuilder().build();
    await tenantRepo.save(tenant);

    const result = await useCase.execute(tenant.id, { name: 'Novo Nome Lavacar' });

    expect(result.name).toBe('Novo Nome Lavacar');
    const saved = await tenantRepo.findById(tenant.id);
    expect(saved!.name).toBe('Novo Nome Lavacar');
  });

  it('throws PlatformDomainError for an invalid IANA timezone', async () => {
    const tenant = new TenantBuilder().build();
    await tenantRepo.save(tenant);

    await expect(
      useCase.execute(tenant.id, {
        settings: { business_hours: { timezone: 'Not/AZone' } },
      }),
    ).rejects.toThrow(PlatformDomainError);
  });

  it('throws PlatformDomainError when expiry_warning_days >= expiry_days', async () => {
    const tenant = new TenantBuilder().build();
    await tenantRepo.save(tenant);

    await expect(
      useCase.execute(tenant.id, {
        settings: { loyalty: { expiry_warning_days: 180 } },
      }),
    ).rejects.toThrow(PlatformDomainError);
  });

  it('persists changes to the repository', async () => {
    const tenant = new TenantBuilder().build();
    await tenantRepo.save(tenant);

    await useCase.execute(tenant.id, {
      settings: { loyalty: { expiry_days: 365 } },
    });

    const reloaded = await tenantRepo.findById(tenant.id);
    expect(reloaded!.settings.loyalty.expiry_days).toBe(365);
  });

  it('tenant isolation — updating tenant A does not affect tenant B', async () => {
    const tenantA = new TenantBuilder().withSlug('iso-a').build();
    const tenantB = new TenantBuilder().withSlug('iso-b').build();
    await tenantRepo.save(tenantA);
    await tenantRepo.save(tenantB);

    await useCase.execute(tenantA.id, {
      settings: { loyalty: { expiry_days: 100 } },
    });

    const reloadedB = await tenantRepo.findById(tenantB.id);
    expect(reloadedB!.settings.loyalty.expiry_days).toBe(180);
  });

  it('throws TenantInactiveError when updating settings on an inactive tenant', async () => {
    const tenant = new TenantBuilder().withSlug('inactive-settings').build();
    tenant.deactivate();
    await tenantRepo.save(tenant);

    await expect(
      useCase.execute(tenant.id, { settings: { loyalty: { expiry_days: 90 } } }),
    ).rejects.toThrow(TenantInactiveError);
  });

  it('throws TenantInactiveError when updating name on an inactive tenant', async () => {
    const tenant = new TenantBuilder().withSlug('inactive-name').build();
    tenant.deactivate();
    await tenantRepo.save(tenant);

    await expect(useCase.execute(tenant.id, { name: 'Novo Nome' })).rejects.toThrow(
      TenantInactiveError,
    );
  });
});
