import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryHotsiteConfigRepository } from '../../../../test/repositories/platform/in-memory-hotsite-config.repository';
import { InMemoryTenantRepository } from '../../../../test/repositories/platform/in-memory-tenant.repository';
import { TEST_REGISTRATION_ID } from '../../../../test/utils/test-registration-id';
import {
  SlugAlreadyTakenError,
  SlugReservedError,
} from '../../domain/errors/platform-domain.error';
import { SlugPolicy } from '../../domain/slug-policy';
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
    useCase = new ProvisionTenantUseCase(
      tenantRepo,
      hotsiteRepo,
      new InMemoryTransactionManager(),
      new SlugPolicy('ikaro'),
    );
  });

  it('provisions a tenant and creates a hotsite config', async () => {
    const result = await useCase.execute({
      name: 'Lavacar Belo',
      slug: 'lavacar-belo',
      adminEmail: 'admin@lavacar.com.br',
      country_code: 'BR',
      registrationId: TEST_REGISTRATION_ID,
      allowOwnerSlug: false,
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
      registrationId: TEST_REGISTRATION_ID,
      allowOwnerSlug: false,
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
      registrationId: TEST_REGISTRATION_ID,
      allowOwnerSlug: false,
    });

    const tenant = await tenantRepo.findBySlug('lavacar-norte');
    expect(tenant!.settings.businessHours.timezone).toBe('America/Manaus');
  });

  it('publishes TenantProvisioned with the country and the registration, and nothing billing-related', async () => {
    await useCase.execute({
      name: 'Lavacar Sul',
      slug: 'lavacar-sul',
      adminEmail: 'sul@lavacar.com.br',
      country_code: 'BR',
      registrationId: TEST_REGISTRATION_ID,
      allowOwnerSlug: false,
    });

    expect(eventBus.published).toHaveLength(1);
    const event = eventBus.published[0] as TenantProvisioned;
    expect(event.eventName).toBe('TenantProvisioned');
    expect(event.data).toEqual({
      name: 'Lavacar Sul',
      slug: 'lavacar-sul',
      adminEmail: 'sul@lavacar.com.br',
      timezone: 'America/Sao_Paulo',
      countryCode: 'BR',
      registrationId: TEST_REGISTRATION_ID,
    });
    // tenantId is in the envelope, not duplicated in data
    expect(event.tenantId).toBeDefined();
    expect((event.data as Record<string, unknown>)['tenantId']).toBeUndefined();
  });

  it('puts the country of a US tenant on the event', async () => {
    await useCase.execute({
      name: 'Lavacar US',
      slug: 'lavacar-us-event',
      adminEmail: 'admin@lavacar.us',
      country_code: 'US',
      registrationId: TEST_REGISTRATION_ID,
      allowOwnerSlug: false,
    });

    expect((eventBus.published[0] as TenantProvisioned).data.countryCode).toBe('US');
  });

  it('carries no tax id, exempt flag or feature list on the event (Billing holds the intent)', async () => {
    await useCase.execute({
      name: 'Lavacar Billing',
      slug: 'lavacar-billing',
      adminEmail: 'billing@lavacar.com.br',
      country_code: 'BR',
      registrationId: TEST_REGISTRATION_ID,
      allowOwnerSlug: false,
    });

    const data = (eventBus.published[0] as TenantProvisioned).data;
    for (const key of ['taxId', 'exempt', 'features', 'billingHint', 'googleSub', 'terms']) {
      expect(data).not.toHaveProperty(key);
    }
  });

  it('does not read Billing: an unknown or already completed registration is not refused here', async () => {
    // The use case has no Billing dependency at all (its constructor takes only the tenant and
    // hotsite repositories, the transaction manager and the slug policy). Refusing an unknown or COMPLETED
    // registration is the Billing handler's job (UC-110 A8).
    await expect(
      useCase.execute({
        name: 'Lavacar Fantasma',
        slug: 'lavacar-fantasma',
        adminEmail: 'x@lavacar.com.br',
        country_code: 'BR',
        registrationId: '00000000-0000-4000-8000-000000000000',
        allowOwnerSlug: false,
      }),
    ).resolves.toBeDefined();
  });

  it('throws SlugAlreadyTakenError when slug is already taken', async () => {
    const base = {
      name: 'A',
      adminEmail: 'a@a.com',
      country_code: 'BR',
      registrationId: TEST_REGISTRATION_ID,
      allowOwnerSlug: false,
    };
    await useCase.execute({ ...base, slug: 'taken-slug' });

    await expect(useCase.execute({ ...base, name: 'B', slug: 'taken-slug' })).rejects.toThrow(
      SlugAlreadyTakenError,
    );
  });

  it('propagates errors thrown inside the transaction', async () => {
    jest.spyOn(hotsiteRepo, 'save').mockRejectedValue(new Error('db error'));

    await expect(
      useCase.execute({
        name: 'A',
        slug: 'fail-slug',
        adminEmail: 'a@a.com',
        country_code: 'BR',
        registrationId: TEST_REGISTRATION_ID,
        allowOwnerSlug: false,
      }),
    ).rejects.toThrow('db error');
  });

  it('tenant isolation — two tenants get separate hotsite configs and one event each', async () => {
    const resA = await useCase.execute({
      name: 'A',
      slug: 'iso-a',
      adminEmail: 'a@a.com',
      country_code: 'BR',
      registrationId: TEST_REGISTRATION_ID,
      allowOwnerSlug: false,
    });
    const resB = await useCase.execute({
      name: 'B',
      slug: 'iso-b',
      adminEmail: 'b@b.com',
      country_code: 'BR',
      registrationId: '0198f1c2-7a3b-7c4d-8e5f-0123456789ac',
      allowOwnerSlug: false,
    });

    const configA = await hotsiteRepo.findByTenantId(resA.tenantId);
    const configB = await hotsiteRepo.findByTenantId(resB.tenantId);

    expect(configA!.tenantId).toBe(resA.tenantId);
    expect(configB!.tenantId).toBe(resB.tenantId);
    expect(configA!.id).not.toBe(configB!.id);
    expect(eventBus.published.map((event) => event.tenantId)).toEqual([
      resA.tenantId,
      resB.tenantId,
    ]);
  });

  describe('reserved slugs (UC-024 A9)', () => {
    const base = {
      name: 'Reservado',
      adminEmail: 'x@lavacar.com.br',
      country_code: 'BR',
      registrationId: TEST_REGISTRATION_ID,
    };

    it('refuses a reserved word and creates nothing', async () => {
      await expect(
        useCase.execute({ ...base, slug: 'dashboard', allowOwnerSlug: true }),
      ).rejects.toBeInstanceOf(SlugReservedError);

      expect(await tenantRepo.findBySlug('dashboard')).toBeNull();
      expect(eventBus.published).toHaveLength(0);
    });

    it('refuses the owner slug when the caller does not allow it', async () => {
      await expect(
        useCase.execute({ ...base, slug: 'ikaro', allowOwnerSlug: false }),
      ).rejects.toBeInstanceOf(SlugReservedError);
    });

    it('provisions the owner slug when the operator path allows it', async () => {
      const result = await useCase.execute({ ...base, slug: 'ikaro', allowOwnerSlug: true });

      expect(result.slug).toBe('ikaro');
    });

    it('does not apply the signup length rule to the operator path', async () => {
      const result = await useCase.execute({ ...base, slug: 'ab', allowOwnerSlug: true });

      expect(result.slug).toBe('ab');
    });

    it('reports a reserved word before a taken one', async () => {
      await useCase.execute({ ...base, slug: 'ikaro', allowOwnerSlug: true });

      await expect(
        useCase.execute({ ...base, slug: 'ikaro', allowOwnerSlug: false }),
      ).rejects.toBeInstanceOf(SlugReservedError);
    });
  });
});
