import {
  PlatformDomainError,
  TenantInactiveError,
  TenantTimezoneImmutableError,
} from './errors/platform-domain.error';
import { TenantProvisioned } from './events/tenant-provisioned.event';
import { Tenant } from './tenant.aggregate';
import { TEST_REGISTRATION_ID } from '../../../test/utils/test-registration-id';
import { TenantSettings } from './value-objects/tenant-settings.vo';
import { TenantBuilder } from '../../../test/builders/platform';

describe('Tenant', () => {
  describe('create()', () => {
    it('creates a valid tenant with all required fields', () => {
      const tenant = new TenantBuilder().build();
      expect(tenant.name).toBe('BeloAuto');
      expect(tenant.slug.value).toBe('beloauto');
      expect(tenant.isActive).toBe(true);
      expect(tenant.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(tenant.createdAt).toBeInstanceOf(Date);
    });

    it('uses America/Sao_Paulo as default timezone', () => {
      const tenant = new TenantBuilder().build();
      expect(tenant.settings.businessHours.timezone).toBe('America/Sao_Paulo');
    });

    it('trims whitespace from name', () => {
      const tenant = new TenantBuilder().withName('  BeloAuto  ').build();
      expect(tenant.name).toBe('BeloAuto');
    });

    it('throws for empty name', () => {
      expect(() => new TenantBuilder().withName('').build()).toThrow(PlatformDomainError);
    });

    it('throws for whitespace-only name', () => {
      expect(() => new TenantBuilder().withName('   ').build()).toThrow(PlatformDomainError);
    });

    it('throws for slug with uppercase letters', () => {
      expect(() => new TenantBuilder().withSlug('INVALID').build()).toThrow(PlatformDomainError);
    });

    it('throws for slug with spaces or special characters', () => {
      expect(() => new TenantBuilder().withSlug('INVALID SLUG!').build()).toThrow(
        PlatformDomainError,
      );
    });

    it('allows slug with hyphens and numbers', () => {
      expect(() => new TenantBuilder().withSlug('lavacar-belo-01').build()).not.toThrow();
    });

    it('raises TenantProvisioned with the default country and the registration id', () => {
      const tenant = Tenant.create(
        'Lavacar',
        'lavacar',
        'a@a.com',
        'corr-1',
        TEST_REGISTRATION_ID,
        'America/Sao_Paulo',
      );

      const [event] = tenant.domainEvents as TenantProvisioned[];
      expect(event.data).toEqual({
        name: 'Lavacar',
        slug: 'lavacar',
        adminEmail: 'a@a.com',
        timezone: 'America/Sao_Paulo',
        countryCode: 'BR',
        registrationId: TEST_REGISTRATION_ID,
      });
    });

    it('puts the country and the registration id on the event', () => {
      const tenant = Tenant.create(
        'Lavacar US',
        'lavacar-us',
        'a@a.us',
        'corr-2',
        TEST_REGISTRATION_ID,
        'America/New_York',
        'US',
      );

      const [event] = tenant.domainEvents as TenantProvisioned[];
      expect(event.data.countryCode).toBe('US');
      expect(event.data.registrationId).toBe(TEST_REGISTRATION_ID);
    });
  });

  describe('deactivate()', () => {
    it('sets isActive to false', () => {
      const tenant = new TenantBuilder().build();
      tenant.deactivate();
      expect(tenant.isActive).toBe(false);
    });

    it('updates updatedAt', () => {
      const tenant = new TenantBuilder().build();
      const before = tenant.updatedAt;
      tenant.deactivate();
      expect(tenant.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });

  describe('updateSettings()', () => {
    const withExpiryDays = (tenant: Tenant, expiryDays: number): TenantSettings => {
      const current = tenant.settings.toJSON();
      return TenantSettings.create({ ...current, loyalty: { ...current.loyalty, expiryDays } });
    };

    it('replaces the settings value object when the timezone is unchanged', () => {
      const tenant = new TenantBuilder().build();
      const next = withExpiryDays(tenant, 365);
      tenant.updateSettings(next);
      expect(tenant.settings).toBe(next);
      expect(tenant.settings.loyalty.expiryDays).toBe(365);
    });

    it('refuses a changed timezone and leaves the settings untouched', () => {
      const tenant = new TenantBuilder().build();
      const before = tenant.settings;
      const updatedAt = tenant.updatedAt;

      expect(() => tenant.updateSettings(TenantSettings.default('America/Manaus'))).toThrow(
        TenantTimezoneImmutableError,
      );

      expect(tenant.settings).toBe(before);
      expect(tenant.settings.businessHours.timezone).toBe('America/Sao_Paulo');
      expect(tenant.updatedAt).toBe(updatedAt);
    });

    it('refuses a changed timezone even when other settings change with it', () => {
      const tenant = new TenantBuilder().build();
      const current = tenant.settings.toJSON();
      const mixed = TenantSettings.create({
        ...current,
        loyalty: { ...current.loyalty, expiryDays: 365 },
        businessHours: { ...current.businessHours, timezone: 'America/Manaus' },
      });

      expect(() => tenant.updateSettings(mixed)).toThrow(TenantTimezoneImmutableError);
      expect(tenant.settings.loyalty.expiryDays).toBe(current.loyalty.expiryDays);
    });

    it('carries PLATFORM_TENANT_TIMEZONE_IMMUTABLE and the settings field on the refusal', () => {
      const tenant = new TenantBuilder().build();
      expect(() => tenant.updateSettings(TenantSettings.default('America/Manaus'))).toThrow(
        expect.objectContaining({
          code: 'PLATFORM_TENANT_TIMEZONE_IMMUTABLE',
          field: 'settings.businessHours.timezone',
        }),
      );
    });

    it('checks the tenant is active before the timezone', () => {
      const tenant = new TenantBuilder().build();
      tenant.deactivate();
      expect(() => tenant.updateSettings(TenantSettings.default('America/Manaus'))).toThrow(
        TenantInactiveError,
      );
    });
  });
});
