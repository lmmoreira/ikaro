import { PlatformDomainError } from '../errors/platform-domain.error';
import { TenantSettings } from './tenant-settings.vo';
import { TenantSettingsPropsBuilder } from '../../../../test/builders/platform';

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
      const props = new TenantSettingsPropsBuilder().withLoyalty({ expiry_days: 0 }).build();
      expect(() => TenantSettings.create(props)).toThrow(PlatformDomainError);
    });

    it('throws for expiry_warning_days >= expiry_days', () => {
      const props = new TenantSettingsPropsBuilder()
        .withLoyalty({ expiry_warning_days: 180 })
        .build();
      expect(() => TenantSettings.create(props)).toThrow(PlatformDomainError);
    });
  });

  describe('create() — booking validation', () => {
    it('throws for cancellation_window_hours above 720', () => {
      const props = new TenantSettingsPropsBuilder()
        .withBooking({ cancellation_window_hours: 721 })
        .build();
      expect(() => TenantSettings.create(props)).toThrow(PlatformDomainError);
    });

    it('throws for invalid slot_granularity_minutes', () => {
      const props = new TenantSettingsPropsBuilder().build();
      (props.booking as { slot_granularity_minutes: number }).slot_granularity_minutes = 45;
      expect(() => TenantSettings.create(props)).toThrow(PlatformDomainError);
    });
  });

  describe('create() — business_hours validation', () => {
    it('throws for invalid IANA timezone', () => {
      const props = new TenantSettingsPropsBuilder()
        .withBusinessHours({ timezone: 'Not/ATimezone' })
        .build();
      expect(() => TenantSettings.create(props)).toThrow(PlatformDomainError);
    });

    it('throws for close before open', () => {
      const props = new TenantSettingsPropsBuilder()
        .withBusinessHours({ monday: { open: '18:00', close: '09:00' } })
        .build();
      expect(() => TenantSettings.create(props)).toThrow(PlatformDomainError);
    });

    it('accepts null day (closed)', () => {
      const props = new TenantSettingsPropsBuilder().withBusinessHours({ saturday: null }).build();
      expect(() => TenantSettings.create(props)).not.toThrow();
    });
  });

  describe('encapsulation — getters return independent copies', () => {
    it('mutating loyalty getter result does not affect internal state', () => {
      const settings = TenantSettings.default();
      const loyalty = settings.loyalty;
      loyalty.expiry_days = 9999;
      expect(settings.loyalty.expiry_days).toBe(180);
    });

    it('mutating booking getter result does not affect internal state', () => {
      const settings = TenantSettings.default();
      const booking = settings.booking;
      booking.cancellation_window_hours = 9999;
      expect(settings.booking.cancellation_window_hours).toBe(48);
    });

    it('mutating business_hours nested day does not affect internal state', () => {
      const settings = TenantSettings.default();
      const hours = settings.business_hours;
      hours.monday!.open = '00:00';
      expect(settings.business_hours.monday!.open).toBe('09:00');
    });

    it('toJSON returns a deep clone — mutating it does not affect internal state', () => {
      const settings = TenantSettings.default();
      const json = settings.toJSON();
      json.loyalty.expiry_days = 9999;
      json.business_hours.monday!.open = '00:00';
      expect(settings.loyalty.expiry_days).toBe(180);
      expect(settings.business_hours.monday!.open).toBe('09:00');
    });
  });
});
