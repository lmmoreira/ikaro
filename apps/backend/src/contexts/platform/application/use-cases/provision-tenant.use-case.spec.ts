import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryHotsiteConfigRepository } from '../../../../test/repositories/platform/in-memory-hotsite-config.repository';
import { InMemoryTenantRepository } from '../../../../test/repositories/platform/in-memory-tenant.repository';
import { TaxIdValidationError } from '../../../../shared/value-objects/tax-id.vo';
import { SlugAlreadyTakenError } from '../../domain/errors/platform-domain.error';
import { TenantProvisioned } from '../../domain/events/tenant-provisioned.event';
import { ProvisionTenantUseCase } from './provision-tenant.use-case';

const VALID_CPF = '529.982.247-25';
const VALID_CNPJ = '11.222.333/0001-81';
const REGISTRATION_ID = '0198f1c2-7a3b-7c4d-8e5f-0123456789ab';

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
      taxId: VALID_CPF,
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
      taxId: VALID_CNPJ,
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
      taxId: VALID_CPF,
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
    });
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
      taxId: VALID_CPF,
    });

    await expect(
      useCase.execute({
        name: 'B',
        slug: 'taken-slug',
        adminEmail: 'b@b.com',
        country_code: 'BR',
        taxId: VALID_CPF,
      }),
    ).rejects.toThrow(SlugAlreadyTakenError);
  });

  it('propagates errors thrown inside the transaction', async () => {
    jest.spyOn(hotsiteRepo, 'save').mockRejectedValue(new Error('db error'));

    await expect(
      useCase.execute({
        name: 'A',
        slug: 'fail-slug',
        adminEmail: 'a@a.com',
        country_code: 'BR',
        taxId: VALID_CPF,
      }),
    ).rejects.toThrow('db error');
  });

  it('tenant isolation — two tenants get separate hotsite configs', async () => {
    const resA = await useCase.execute({
      name: 'A',
      slug: 'iso-a',
      adminEmail: 'a@a.com',
      country_code: 'BR',
      taxId: VALID_CPF,
    });
    const resB = await useCase.execute({
      name: 'B',
      slug: 'iso-b',
      adminEmail: 'b@b.com',
      country_code: 'BR',
      taxId: VALID_CNPJ,
    });

    const configA = await hotsiteRepo.findByTenantId(resA.tenantId);
    const configB = await hotsiteRepo.findByTenantId(resB.tenantId);

    expect(configA!.tenantId).toBe(resA.tenantId);
    expect(configB!.tenantId).toBe(resB.tenantId);
    expect(configA!.id).not.toBe(configB!.id);
    // one event per tenant, each carrying only its own tenant's id
    expect(eventBus.published.map((event) => event.tenantId)).toEqual([
      resA.tenantId,
      resB.tenantId,
    ]);
  });

  describe('tax id (validated here, never stored or published)', () => {
    const base = {
      name: 'Lavacar Fiscal',
      slug: 'lavacar-fiscal',
      adminEmail: 'fiscal@lavacar.com.br',
      country_code: 'BR',
    };

    async function codeOf(promise: Promise<unknown>): Promise<unknown> {
      try {
        await promise;
      } catch (err) {
        expect(err).toBeInstanceOf(TaxIdValidationError);
        return (err as TaxIdValidationError).code;
      }
      throw new Error('expected a TaxIdValidationError');
    }

    it.each([
      ['a missing tax id', undefined],
      ['a blank tax id', '   '],
    ])(
      'refuses a non-exempt BR tenant with %s as SIGNUP_TAX_ID_REQUIRED',
      async (_label, taxId) => {
        expect(await codeOf(useCase.execute({ ...base, taxId }))).toBe('SIGNUP_TAX_ID_REQUIRED');
        expect(await tenantRepo.findBySlug(base.slug)).toBeNull();
        expect(eventBus.published).toHaveLength(0);
      },
    );

    it('refuses a BR tax id with wrong check digits as SIGNUP_TAX_ID_INVALID, creating nothing', async () => {
      expect(await codeOf(useCase.execute({ ...base, taxId: '529.982.247-26' }))).toBe(
        'SIGNUP_TAX_ID_INVALID',
      );
      expect(await tenantRepo.findBySlug(base.slug)).toBeNull();
      expect(eventBus.published).toHaveLength(0);
    });

    it('accepts a BR CPF and a CNPJ', async () => {
      await useCase.execute({ ...base, slug: 'fiscal-cpf', taxId: VALID_CPF });
      await useCase.execute({ ...base, slug: 'fiscal-cnpj', taxId: VALID_CNPJ });
      expect(eventBus.published).toHaveLength(2);
    });

    it('does not require a tax id from an exempt BR tenant', async () => {
      await expect(useCase.execute({ ...base, exempt: true })).resolves.toBeDefined();
    });

    it('still checks a tax id an exempt tenant sends', async () => {
      expect(await codeOf(useCase.execute({ ...base, exempt: true, taxId: '123' }))).toBe(
        'SIGNUP_TAX_ID_INVALID',
      );
      expect(await tenantRepo.findBySlug(base.slug)).toBeNull();
    });

    it('does not reject a non-exempt US tenant up front, with or without a tax id', async () => {
      const us = { ...base, country_code: 'US', adminEmail: 'fiscal@lavacar.us' };
      await expect(useCase.execute({ ...us, slug: 'fiscal-us-1' })).resolves.toBeDefined();
      await expect(
        useCase.execute({ ...us, slug: 'fiscal-us-2', taxId: '12-3456789' }),
      ).resolves.toBeDefined();
    });

    it('never puts the tax id on the event', async () => {
      await useCase.execute({ ...base, taxId: VALID_CPF, registrationId: REGISTRATION_ID });

      const event = eventBus.published[0] as TenantProvisioned;
      const serialised = JSON.stringify(event);
      expect(serialised).not.toContain('52998224725');
      expect(serialised).not.toContain(VALID_CPF);
      expect(serialised).not.toContain('taxId');
    });
  });

  describe('billingHint on the event', () => {
    const base = {
      name: 'Lavacar Hint',
      slug: 'lavacar-hint',
      adminEmail: 'hint@lavacar.com.br',
      country_code: 'BR',
      taxId: VALID_CPF,
    };

    function publishedData(): TenantProvisioned['data'] {
      return (eventBus.published[0] as TenantProvisioned).data;
    }

    it('is absent for a call that asks Billing for nothing (legacy shape), countryCode still present', async () => {
      await useCase.execute(base);

      expect(publishedData().countryCode).toBe('BR');
      expect('billingHint' in publishedData()).toBe(false);
    });

    it('is absent for an explicit exempt: false with nothing else', async () => {
      await useCase.execute({ ...base, exempt: false });

      expect('billingHint' in publishedData()).toBe(false);
    });

    it('carries exempt: true for an exempt tenant', async () => {
      await useCase.execute({ ...base, exempt: true });

      expect(publishedData().billingHint).toEqual({ exempt: true });
    });

    it('carries the requested feature subset with exempt: false', async () => {
      await useCase.execute({ ...base, features: ['HOTSITE', 'BOOKING'] });

      expect(publishedData().billingHint).toEqual({
        exempt: false,
        features: ['HOTSITE', 'BOOKING'],
      });
    });

    it('carries the registrationId without reading Billing (shape only, no lookup)', async () => {
      // The use case has no Billing dependency at all: an unknown or COMPLETED registration is not
      // refused here, S11's use case does it.
      await useCase.execute({ ...base, registrationId: REGISTRATION_ID });

      expect(publishedData().billingHint).toEqual({
        exempt: false,
        registrationId: REGISTRATION_ID,
      });
    });

    it('omits features when none were requested (omitted means every feature)', async () => {
      await useCase.execute({ ...base, registrationId: REGISTRATION_ID });

      expect(publishedData().billingHint).not.toHaveProperty('features');
    });

    it('keeps every pre-existing payload field unchanged next to the new ones', async () => {
      await useCase.execute({ ...base, exempt: true, features: ['HOTSITE'] });

      expect(publishedData()).toEqual({
        name: 'Lavacar Hint',
        slug: 'lavacar-hint',
        adminEmail: 'hint@lavacar.com.br',
        timezone: 'America/Sao_Paulo',
        countryCode: 'BR',
        billingHint: { exempt: true, features: ['HOTSITE'] },
      });
    });
  });
});
