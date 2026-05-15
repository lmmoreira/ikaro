import { TenantSettings, TenantSettingsProps } from './tenant-settings.vo';
import { PlatformDomainError } from '../errors/platform-domain.error';

function validProps(): TenantSettingsProps {
  return TenantSettings.default().toJSON();
}

describe('TenantSettings', () => {
  describe('default()', () => {
    it('returns settings with all default values', () => {
      const settings = TenantSettings.default();
      expect(settings.loyalty.expiry_days).toBe(180);
      expect(settings.loyalty.enable_notifications).toBe(true);
      expect(settings.loyalty.expiry_warning_days).toBe(7);
      expect(settings.booking.cancellation_window_hours).toBe(48);
      expect(settings.booking.auto_approve_enabled).toBe(false);
      expect(settings.booking.min_booking_advance_hours).toBe(0);
      expect(settings.booking.max_booking_advance_days).toBe(90);
      expect(settings.booking.service_buffer_minutes).toBe(60);
      expect(settings.booking.slot_granularity_minutes).toBe(30);
      expect(settings.business_hours.timezone).toBe('America/Sao_Paulo');
      expect(settings.business_hours.monday).toEqual({ open: '09:00', close: '18:00' });
      expect(settings.business_hours.sunday).toBeNull();
      expect(settings.localization.currency).toBe('BRL');
      expect(settings.localization.language).toBe('pt-BR');
    });

    it('accepts a custom timezone', () => {
      const settings = TenantSettings.default('America/Manaus');
      expect(settings.business_hours.timezone).toBe('America/Manaus');
    });
  });

  describe('create() — loyalty validation', () => {
    it('throws for expiry_days out of range', () => {
      const props = validProps();
      props.loyalty.expiry_days = 0;
      expect(() => TenantSettings.create(props)).toThrow(PlatformDomainError);
    });

    it('throws for expiry_warning_days >= expiry_days', () => {
      const props = validProps();
      props.loyalty.expiry_warning_days = 180;
      expect(() => TenantSettings.create(props)).toThrow(PlatformDomainError);
    });
  });

  describe('create() — booking validation', () => {
    it('throws for cancellation_window_hours above 720', () => {
      const props = validProps();
      props.booking.cancellation_window_hours = 721;
      expect(() => TenantSettings.create(props)).toThrow(PlatformDomainError);
    });

    it('throws for invalid slot_granularity_minutes', () => {
      const props = validProps();
      (props.booking as { slot_granularity_minutes: number }).slot_granularity_minutes = 45;
      expect(() => TenantSettings.create(props)).toThrow(PlatformDomainError);
    });
  });

  describe('create() — business_hours validation', () => {
    it('throws for invalid IANA timezone', () => {
      const props = validProps();
      props.business_hours.timezone = 'Not/ATimezone';
      expect(() => TenantSettings.create(props)).toThrow(PlatformDomainError);
    });

    it('throws for close before open', () => {
      const props = validProps();
      props.business_hours.monday = { open: '18:00', close: '09:00' };
      expect(() => TenantSettings.create(props)).toThrow(PlatformDomainError);
    });

    it('accepts null day (closed)', () => {
      const props = validProps();
      props.business_hours.saturday = null;
      expect(() => TenantSettings.create(props)).not.toThrow();
    });
  });
});
