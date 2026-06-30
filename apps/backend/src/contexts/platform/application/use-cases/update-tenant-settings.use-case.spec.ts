import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
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
    useCase = new UpdateTenantSettingsUseCase(tenantRepo, new InMemoryTransactionManager());
  });

  it('throws TenantNotFoundError when the tenant does not exist', async () => {
    await expect(
      useCase.execute({ tenantId: 'non-existent-id', settings: { loyalty: { expiryDays: 90 } } }),
    ).rejects.toThrow(TenantNotFoundError);
  });

  it('merges partial loyalty settings without wiping other fields', async () => {
    const tenant = new TenantBuilder().build();
    await tenantRepo.save(tenant);

    const result = await useCase.execute({ tenantId: tenant.id,
      settings: { loyalty: { expiryDays: 90 } },
    });

    expect(result.settings.loyalty.expiryDays).toBe(90);
    expect(result.settings.loyalty.enableNotifications).toBe(true);
    expect(result.settings.loyalty.expiryWarningDays).toBe(7);
    expect(result.settings.booking.cancellationWindowHours).toBe(48);
  });

  it('merges partial booking settings without touching loyalty or businessHours', async () => {
    const tenant = new TenantBuilder().build();
    await tenantRepo.save(tenant);

    const result = await useCase.execute({ tenantId: tenant.id,
      settings: { booking: { cancellationWindowHours: 24 } },
    });

    expect(result.settings.booking.cancellationWindowHours).toBe(24);
    expect(result.settings.booking.maxBookingAdvanceDays).toBe(90);
    expect(result.settings.loyalty.expiryDays).toBe(180);
  });

  it('updates businessHours timezone and keeps existing day hours', async () => {
    const tenant = new TenantBuilder().build();
    await tenantRepo.save(tenant);

    const result = await useCase.execute({ tenantId: tenant.id,
      settings: { businessHours: { timezone: 'America/Manaus' } },
    });

    expect(result.settings.businessHours.timezone).toBe('America/Manaus');
    expect(result.settings.businessHours.monday).toEqual({ open: '09:00', close: '18:00' });
  });

  it('closes a day by setting it to null', async () => {
    const tenant = new TenantBuilder().build();
    await tenantRepo.save(tenant);

    const result = await useCase.execute({ tenantId: tenant.id,
      settings: { businessHours: { saturday: null } },
    });

    expect(result.settings.businessHours.saturday).toBeNull();
    expect(result.settings.businessHours.monday).toEqual({ open: '09:00', close: '18:00' });
  });

  it('merges partial businessInfo without wiping other settings', async () => {
    const tenant = new TenantBuilder().build();
    await tenantRepo.save(tenant);

    const result = await useCase.execute({ tenantId: tenant.id,
      settings: { businessInfo: { phone: '+5511987654321' } },
    });

    expect(result.settings.businessInfo).toEqual({
      phone: '+5511987654321',
      email: null,
      address: null,
      socialLinks: null,
    });
    expect(result.settings.loyalty.expiryDays).toBe(180);
  });

  it('sets socialLinks in businessInfo', async () => {
    const tenant = new TenantBuilder().build();
    await tenantRepo.save(tenant);

    const result = await useCase.execute({ tenantId: tenant.id,
      settings: {
        businessInfo: {
          socialLinks: {
            whatsapp: '+5511987654321',
            instagram: 'https://instagram.com/lavacar',
            facebook: 'https://facebook.com/lavacar',
          },
        },
      },
    });

    expect(result.settings.businessInfo!.socialLinks).toEqual({
      whatsapp: '+5511987654321',
      instagram: 'https://instagram.com/lavacar',
      facebook: 'https://facebook.com/lavacar',
    });
    expect(result.settings.businessInfo!.phone).toBeNull();
  });

  it('partial socialLinks update preserves untouched fields', async () => {
    const tenant = new TenantBuilder().build();
    await tenantRepo.save(tenant);

    await useCase.execute({ tenantId: tenant.id,
      settings: {
        businessInfo: {
          socialLinks: {
            whatsapp: '+5511987654321',
            instagram: 'https://instagram.com/lavacar',
            facebook: 'https://facebook.com/lavacar',
          },
        },
      },
    });

    const result = await useCase.execute({ tenantId: tenant.id,
      settings: { businessInfo: { socialLinks: { whatsapp: '+5511999999999' } } },
    });

    expect(result.settings.businessInfo!.socialLinks).toEqual({
      whatsapp: '+5511999999999',
      instagram: 'https://instagram.com/lavacar',
      facebook: 'https://facebook.com/lavacar',
    });
  });

  it('throws PlatformDomainError for an invalid businessInfo.phone', async () => {
    const tenant = new TenantBuilder().build();
    await tenantRepo.save(tenant);

    await expect(
      useCase.execute({ tenantId: tenant.id,
        settings: { businessInfo: { phone: '123' } },
      }),
    ).rejects.toThrow(PlatformDomainError);
  });

  it('throws PlatformDomainError for an invalid IANA timezone', async () => {
    const tenant = new TenantBuilder().build();
    await tenantRepo.save(tenant);

    await expect(
      useCase.execute({ tenantId: tenant.id,
        settings: { businessHours: { timezone: 'Not/AZone' } },
      }),
    ).rejects.toThrow(PlatformDomainError);
  });

  it('throws PlatformDomainError when expiryWarningDays >= expiryDays', async () => {
    const tenant = new TenantBuilder().build();
    await tenantRepo.save(tenant);

    await expect(
      useCase.execute({ tenantId: tenant.id,
        settings: { loyalty: { expiryWarningDays: 180 } },
      }),
    ).rejects.toThrow(PlatformDomainError);
  });

  it('persists changes to the repository', async () => {
    const tenant = new TenantBuilder().build();
    await tenantRepo.save(tenant);

    await useCase.execute({ tenantId: tenant.id,
      settings: { loyalty: { expiryDays: 365 } },
    });

    const reloaded = await tenantRepo.findById(tenant.id);
    expect(reloaded!.settings.loyalty.expiryDays).toBe(365);
  });

  it('tenant isolation — updating tenant A does not affect tenant B', async () => {
    const tenantA = new TenantBuilder().withSlug('iso-a').build();
    const tenantB = new TenantBuilder().withSlug('iso-b').build();
    await tenantRepo.save(tenantA);
    await tenantRepo.save(tenantB);

    await useCase.execute({ tenantId: tenantA.id,
      settings: { loyalty: { expiryDays: 100 } },
    });

    const reloadedB = await tenantRepo.findById(tenantB.id);
    expect(reloadedB!.settings.loyalty.expiryDays).toBe(180);
  });

  it('throws TenantInactiveError when updating settings on an inactive tenant', async () => {
    const tenant = new TenantBuilder().withSlug('inactive-settings').build();
    tenant.deactivate();
    await tenantRepo.save(tenant);

    await expect(
      useCase.execute({ tenantId: tenant.id, settings: { loyalty: { expiryDays: 90 } } }),
    ).rejects.toThrow(TenantInactiveError);
  });
});
