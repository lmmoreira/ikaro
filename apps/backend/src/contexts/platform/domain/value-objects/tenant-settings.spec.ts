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
      expect(settings.loyalty.notification_min_points).toBe(50);
      expect(settings.booking.cancellation_window_hours).toBe(48);
      expect(settings.booking.auto_approve_enabled).toBe(false);
      expect(settings.booking.min_booking_advance_hours).toBe(0);
      expect(settings.booking.max_booking_advance_days).toBe(90);
      expect(settings.booking.service_buffer_minutes).toBe(60);
      expect(settings.booking.slot_granularity_minutes).toBe(30);
      expect(settings.business_hours.timezone).toBe('America/Sao_Paulo');
      expect(settings.business_hours.monday).toEqual({ open: '09:00', close: '18:00' });
      expect(settings.business_hours.sunday).toBeNull();
      expect(settings.localization.country_code).toBe('BR');
      expect(settings.localization.currency).toBe('BRL');
      expect(settings.localization.language).toBe('pt-BR');
      expect(settings.notification.from_email).toBeNull();
      expect(settings.business_info).toEqual({
        phone: null,
        email: null,
        address: null,
        social_links: null,
      });
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

    it('throws for notification_min_points above 10000', () => {
      const props = new TenantSettingsPropsBuilder()
        .withLoyalty({ notification_min_points: 10001 })
        .build();
      expect(() => TenantSettings.create(props)).toThrow(PlatformDomainError);
    });

    it('accepts notification_min_points of 0 (no threshold)', () => {
      const props = new TenantSettingsPropsBuilder()
        .withLoyalty({ notification_min_points: 0 })
        .build();
      expect(() => TenantSettings.create(props)).not.toThrow();
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

  describe('create() — business_info validation', () => {
    const validAddress = {
      street: 'Av. Paulista',
      number: '1000',
      neighborhood: 'Bela Vista',
      city: 'São Paulo',
      state: 'SP',
      zip_code: '01310100',
    };

    it('accepts the default all-null business_info', () => {
      const props = new TenantSettingsPropsBuilder().build();
      expect(() => TenantSettings.create(props)).not.toThrow();
    });

    it('accepts a partial business_info with only phone set', () => {
      const props = new TenantSettingsPropsBuilder()
        .withBusinessInfo({ phone: '+5511987654321' })
        .build();
      const settings = TenantSettings.create(props);
      expect(settings.business_info).toEqual({
        phone: '+5511987654321',
        email: null,
        address: null,
        social_links: null,
      });
    });

    it('accepts a full business_info with a valid address', () => {
      const props = new TenantSettingsPropsBuilder()
        .withBusinessInfo({
          phone: '+5511987654321',
          email: 'contato@beloauto.com.br',
          address: validAddress,
        })
        .build();
      expect(() => TenantSettings.create(props)).not.toThrow();
    });

    it('throws for an invalid phone', () => {
      const props = new TenantSettingsPropsBuilder().withBusinessInfo({ phone: '123' }).build();
      expect(() => TenantSettings.create(props)).toThrow(PlatformDomainError);
    });

    it('throws for an invalid email', () => {
      const props = new TenantSettingsPropsBuilder()
        .withBusinessInfo({ email: 'not-an-email' })
        .build();
      expect(() => TenantSettings.create(props)).toThrow(PlatformDomainError);
    });

    it('throws for a zip_code that is not 8 digits', () => {
      const props = new TenantSettingsPropsBuilder()
        .withBusinessInfo({ address: { ...validAddress, zip_code: '123' } })
        .build();
      expect(() => TenantSettings.create(props)).toThrow(PlatformDomainError);
    });

    it('throws for a state that is not a 2-letter uppercase UF', () => {
      const props = new TenantSettingsPropsBuilder()
        .withBusinessInfo({ address: { ...validAddress, state: 'sp' } })
        .build();
      expect(() => TenantSettings.create(props)).toThrow(PlatformDomainError);
    });

    it('throws when the address is missing a required field', () => {
      const props = new TenantSettingsPropsBuilder()
        .withBusinessInfo({ address: { ...validAddress, street: '' } })
        .build();
      expect(() => TenantSettings.create(props)).toThrow(PlatformDomainError);
    });

    it('accepts business_info with social_links set and exposes them via getter', () => {
      const props = new TenantSettingsPropsBuilder()
        .withBusinessInfo({ phone: '+5511987654321' })
        .withSocialLinks({
          whatsapp: '+5511987654321',
          instagram: 'https://instagram.com/lavacar',
          facebook: null,
        })
        .build();
      const settings = TenantSettings.create(props);
      expect(settings.business_info.social_links).toEqual({
        whatsapp: '+5511987654321',
        instagram: 'https://instagram.com/lavacar',
        facebook: null,
      });
    });

    it('toJSON() serialises social_links from business_info', () => {
      const props = new TenantSettingsPropsBuilder()
        .withSocialLinks({ whatsapp: '+5511987654321', instagram: null, facebook: null })
        .build();
      const settings = TenantSettings.create(props);
      expect(settings.toJSON().business_info!.social_links).toEqual({
        whatsapp: '+5511987654321',
        instagram: null,
        facebook: null,
      });
    });

    it('throws for an invalid social_links.whatsapp (not a phone number)', () => {
      const props = new TenantSettingsPropsBuilder()
        .withSocialLinks({ whatsapp: '123', instagram: null, facebook: null })
        .build();
      expect(() => TenantSettings.create(props)).toThrow(PlatformDomainError);
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
