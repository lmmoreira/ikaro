import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryHotsiteConfigRepository } from '../../../../test/repositories/platform/in-memory-hotsite-config.repository';
import { InMemoryTenantRepository } from '../../../../test/repositories/platform/in-memory-tenant.repository';
import { SlugAlreadyTakenError } from '../../domain/errors/platform-domain.error';
import { TenantProvisioned } from '../../domain/events/tenant-provisioned.event';
import { ProvisionTenantUseCase } from './provision-tenant.use-case';

describe('ProvisionTenantUseCase', () => {
  let tenantRepo: InMemoryTenantRepository;
  let hotsiteRepo: InMemoryHotsiteConfigRepository;
  let eventBus: InMemoryEventBus;
  let useCase: ProvisionTenantUseCase;

  beforeEach(() => {
    eventBus = new InMemoryEventBus();
    tenantRepo = new InMemoryTenantRepository(eventBus);
    hotsiteRepo = new InMemoryHotsiteConfigRepository();
    useCase = new ProvisionTenantUseCase(tenantRepo, hotsiteRepo, new InMemoryTransactionManager());
  });

  it('provisions a tenant and creates a hotsite config', async () => {
    const result = await useCase.execute({
      name: 'Lavacar Belo',
      slug: 'lavacar-belo',
      adminEmail: 'admin@lavacar.com.br',
      country_code: 'BR',
    });

    expect(result.slug).toBe('lavacar-belo');
    expect(result.name).toBe('Lavacar Belo');
    expect(result.tenantId).toBeDefined();

    const savedTenant = await tenantRepo.findBySlug('lavacar-belo');
    expect(savedTenant).not.toBeNull();
    expect(savedTenant!.settings.businessHours.timezone).toBe('America/Sao_Paulo');

    const savedConfig = await hotsiteRepo.findByTenantId(result.tenantId);
    expect(savedConfig).not.toBeNull();
    expect(savedConfig!.isPublished).toBe(false);
  });

  it('uses the country default timezone when timezone is omitted for a non-BR country', async () => {
    await useCase.execute({
      name: 'Lavacar US',
      slug: 'lavacar-us',
      adminEmail: 'admin@lavacar.us',
      country_code: 'US',
    });

    const tenant = await tenantRepo.findBySlug('lavacar-us');
    expect(tenant!.settings.businessHours.timezone).toBe('America/New_York');
    expect(tenant!.settings.localization.countryCode).toBe('US');
    expect(tenant!.settings.localization.currency).toBe('USD');
    expect(tenant!.settings.localization.language).toBe('en');
  });

  it('uses the provided timezone instead of the default', async () => {
    await useCase.execute({
      name: 'Lavacar Norte',
      slug: 'lavacar-norte',
      adminEmail: 'admin@norte.com.br',
      country_code: 'BR',
      timezone: 'America/Manaus',
    });

    const tenant = await tenantRepo.findBySlug('lavacar-norte');
    expect(tenant!.settings.businessHours.timezone).toBe('America/Manaus');
  });

  it('publishes TenantProvisioned event from aggregate with correct payload', async () => {
    await useCase.execute({
      name: 'Lavacar Sul',
      slug: 'lavacar-sul',
      adminEmail: 'sul@lavacar.com.br',
      country_code: 'BR',
    });

    expect(eventBus.published).toHaveLength(1);
    const event = eventBus.published[0] as TenantProvisioned;
    expect(event.eventName).toBe('TenantProvisioned');
    expect(event.data.slug).toBe('lavacar-sul');
    expect(event.data.adminEmail).toBe('sul@lavacar.com.br');
    expect(event.data.timezone).toBe('America/Sao_Paulo');
    expect(event.data.name).toBe('Lavacar Sul');
    // tenantId is in the envelope, not duplicated in data
    expect(event.tenantId).toBeDefined();
    expect((event.data as Record<string, unknown>)['tenantId']).toBeUndefined();
  });

  it('throws SlugAlreadyTakenError when slug is already taken', async () => {
    await useCase.execute({
      name: 'A',
      slug: 'taken-slug',
      adminEmail: 'a@a.com',
      country_code: 'BR',
    });

    await expect(
      useCase.execute({ name: 'B', slug: 'taken-slug', adminEmail: 'b@b.com', country_code: 'BR' }),
    ).rejects.toThrow(SlugAlreadyTakenError);
  });

  it('propagates errors thrown inside the transaction', async () => {
    jest.spyOn(hotsiteRepo, 'save').mockRejectedValue(new Error('db error'));

    await expect(
      useCase.execute({ name: 'A', slug: 'fail-slug', adminEmail: 'a@a.com', country_code: 'BR' }),
    ).rejects.toThrow('db error');
  });

  it('tenant isolation — two tenants get separate hotsite configs', async () => {
    const resA = await useCase.execute({
      name: 'A',
      slug: 'iso-a',
      adminEmail: 'a@a.com',
      country_code: 'BR',
    });
    const resB = await useCase.execute({
      name: 'B',
      slug: 'iso-b',
      adminEmail: 'b@b.com',
      country_code: 'BR',
    });

    const configA = await hotsiteRepo.findByTenantId(resA.tenantId);
    const configB = await hotsiteRepo.findByTenantId(resB.tenantId);

    expect(configA!.tenantId).toBe(resA.tenantId);
    expect(configB!.tenantId).toBe(resB.tenantId);
    expect(configA!.id).not.toBe(configB!.id);
  });
});
