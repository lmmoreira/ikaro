import { Tenant } from './tenant.aggregate';
import { PlatformDomainError } from './errors/platform-domain.error';
import { TenantSettings } from './value-objects/tenant-settings.vo';

describe('Tenant', () => {
  describe('create()', () => {
    it('creates a valid tenant with all required fields', () => {
      const tenant = Tenant.create('BeloAuto', 'beloauto', 'America/Sao_Paulo');
      expect(tenant.name).toBe('BeloAuto');
      expect(tenant.slug).toBe('beloauto');
      expect(tenant.isActive).toBe(true);
      expect(tenant.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(tenant.createdAt).toBeInstanceOf(Date);
    });

    it('uses America/Sao_Paulo as default timezone', () => {
      const tenant = Tenant.create('BeloAuto', 'beloauto');
      expect(tenant.settings.business_hours.timezone).toBe('America/Sao_Paulo');
    });

    it('trims whitespace from name', () => {
      const tenant = Tenant.create('  BeloAuto  ', 'beloauto');
      expect(tenant.name).toBe('BeloAuto');
    });

    it('throws for empty name', () => {
      expect(() => Tenant.create('', 'beloauto')).toThrow(PlatformDomainError);
    });

    it('throws for whitespace-only name', () => {
      expect(() => Tenant.create('   ', 'beloauto')).toThrow(PlatformDomainError);
    });

    it('throws for slug with uppercase letters', () => {
      expect(() => Tenant.create('Name', 'INVALID')).toThrow(PlatformDomainError);
    });

    it('throws for slug with spaces or special characters', () => {
      expect(() => Tenant.create('Name', 'INVALID SLUG!')).toThrow(PlatformDomainError);
    });

    it('allows slug with hyphens and numbers', () => {
      expect(() => Tenant.create('Name', 'lavacar-belo-01')).not.toThrow();
    });
  });

  describe('deactivate()', () => {
    it('sets isActive to false', () => {
      const tenant = Tenant.create('BeloAuto', 'beloauto');
      tenant.deactivate();
      expect(tenant.isActive).toBe(false);
    });

    it('updates updatedAt', () => {
      const tenant = Tenant.create('BeloAuto', 'beloauto');
      const before = tenant.updatedAt;
      tenant.deactivate();
      expect(tenant.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });

  describe('updateSettings()', () => {
    it('replaces the settings value object', () => {
      const tenant = Tenant.create('BeloAuto', 'beloauto');
      const newSettings = TenantSettings.default('America/Manaus');
      tenant.updateSettings(newSettings);
      expect(tenant.settings.business_hours.timezone).toBe('America/Manaus');
    });
  });
});
