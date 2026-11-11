import { PlatformDomainError } from './errors/platform-domain.error';
import { TenantProvisioned } from './events/tenant-provisioned.event';
import { Tenant } from './tenant.aggregate';
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

    it('raises TenantProvisioned with countryCode and no billingHint when none is given', () => {
      const tenant = Tenant.create('Lavacar', 'lavacar', 'a@a.com', 'corr-1', 'America/Sao_Paulo');

      const [event] = tenant.domainEvents as TenantProvisioned[];
      expect(event.data).toEqual({
        name: 'Lavacar',
        slug: 'lavacar',
        adminEmail: 'a@a.com',
        timezone: 'America/Sao_Paulo',
        countryCode: 'BR',
      });
    });

    it('puts the country and the billing hint on the event', () => {
      const tenant = Tenant.create(
        'Lavacar US',
        'lavacar-us',
        'a@a.us',
        'corr-2',
        'America/New_York',
        'US',
        {
          exempt: false,
          features: ['HOTSITE'],
          registrationId: '0198f1c2-7a3b-7c4d-8e5f-0123456789ab',
        },
      );

      const [event] = tenant.domainEvents as TenantProvisioned[];
      expect(event.data.countryCode).toBe('US');
      expect(event.data.billingHint).toEqual({
        exempt: false,
        features: ['HOTSITE'],
        registrationId: '0198f1c2-7a3b-7c4d-8e5f-0123456789ab',
      });
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
    it('replaces the settings value object', () => {
      const tenant = new TenantBuilder().build();
      const newSettings = TenantSettings.default('America/Manaus');
      tenant.updateSettings(newSettings);
      expect(tenant.settings.businessHours.timezone).toBe('America/Manaus');
    });
  });
});
