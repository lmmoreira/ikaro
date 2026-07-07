import { PlatformDomainError } from '../errors/platform-domain.error';
import { AddressValidationError } from '../../../../shared/value-objects/address';
import { CountryCodeValidationError } from '../../../../shared/value-objects/country-code.vo';
import { TenantSettings, TenantSettingsValidationError } from './tenant-settings.vo';
import { TenantSettingsPropsBuilder } from '../../../../test/builders/platform';

describe('TenantSettings', () => {
  describe('default()', () => {
    it('returns settings with all default values', () => {
      const settings = TenantSettings.default();
      expect(settings.loyalty.expiryDays).toBe(180);
      expect(settings.loyalty.enableNotifications).toBe(true);
      expect(settings.loyalty.expiryWarningDays).toBe(7);
      expect(settings.loyalty.notificationMinPoints).toBe(50);
      expect(settings.loyalty.pointsPerCurrencyUnit).toBe(0);
      expect(settings.booking.cancellationWindowHours).toBe(48);
      expect(settings.booking.autoApproveEnabled).toBe(false);
      expect(settings.booking.minBookingAdvanceHours).toBe(0);
      expect(settings.booking.maxBookingAdvanceDays).toBe(90);
      expect(settings.booking.serviceBufferMinutes).toBe(60);
      expect(settings.booking.slotGranularityMinutes).toBe(30);
      expect(settings.booking.welcomeStaffScreenDays).toBe(14);
      expect(settings.businessHours.timezone).toBe('America/Sao_Paulo');
      expect(settings.businessHours.monday).toEqual({ open: '09:00', close: '18:00' });
      expect(settings.businessHours.sunday).toBeNull();
      expect(settings.localization.countryCode).toBe('BR');
      expect(settings.localization.currency).toBe('BRL');
      expect(settings.localization.language).toBe('pt-BR');
      expect(settings.notification.fromEmail).toBeNull();
      expect(settings.businessInfo).toEqual({
        phone: null,
        email: null,
        address: null,
        socialLinks: null,
      });
    });

    it('accepts a custom timezone', () => {
      const settings = TenantSettings.default('America/Manaus');
      expect(settings.businessHours.timezone).toBe('America/Manaus');
    });

    it('throws for an unsupported country code', () => {
      expect(() => TenantSettings.default('America/Sao_Paulo', 'ZZ')).toThrow(
        CountryCodeValidationError,
      );
    });
  });

  describe('create() — loyalty validation', () => {
    it('throws for expiryDays out of range', () => {
      const props = new TenantSettingsPropsBuilder().withLoyalty({ expiryDays: 0 }).build();
      expect(() => TenantSettings.create(props)).toThrow(PlatformDomainError);
    });

    it('throws for expiryWarningDays >= expiryDays', () => {
      const props = new TenantSettingsPropsBuilder()
        .withLoyalty({ expiryWarningDays: 180 })
        .build();
      expect(() => TenantSettings.create(props)).toThrow(PlatformDomainError);
    });

    it('throws for notificationMinPoints above 10000', () => {
      const props = new TenantSettingsPropsBuilder()
        .withLoyalty({ notificationMinPoints: 10001 })
        .build();
      expect(() => TenantSettings.create(props)).toThrow(PlatformDomainError);
    });

    it('accepts notificationMinPoints of 0 (no threshold)', () => {
      const props = new TenantSettingsPropsBuilder()
        .withLoyalty({ notificationMinPoints: 0 })
        .build();
      expect(() => TenantSettings.create(props)).not.toThrow();
    });

    it('accepts pointsPerCurrencyUnit of 10', () => {
      const props = new TenantSettingsPropsBuilder()
        .withLoyalty({ pointsPerCurrencyUnit: 10 })
        .build();
      expect(() => TenantSettings.create(props)).not.toThrow();
    });

    it('accepts pointsPerCurrencyUnit of 0 (redemption disabled)', () => {
      const props = new TenantSettingsPropsBuilder()
        .withLoyalty({ pointsPerCurrencyUnit: 0 })
        .build();
      expect(() => TenantSettings.create(props)).not.toThrow();
    });

    it('accepts pointsPerCurrencyUnit at the upper boundary of 10000', () => {
      const props = new TenantSettingsPropsBuilder()
        .withLoyalty({ pointsPerCurrencyUnit: 10000 })
        .build();
      expect(() => TenantSettings.create(props)).not.toThrow();
    });

    it('throws for pointsPerCurrencyUnit below 0', () => {
      const props = new TenantSettingsPropsBuilder()
        .withLoyalty({ pointsPerCurrencyUnit: -1 })
        .build();
      expect(() => TenantSettings.create(props)).toThrow(PlatformDomainError);
    });

    it('throws for pointsPerCurrencyUnit above 10000', () => {
      const props = new TenantSettingsPropsBuilder()
        .withLoyalty({ pointsPerCurrencyUnit: 10001 })
        .build();
      expect(() => TenantSettings.create(props)).toThrow(PlatformDomainError);
    });
  });

  describe('create() — booking validation', () => {
    it('throws for cancellationWindowHours above 720', () => {
      const props = new TenantSettingsPropsBuilder()
        .withBooking({ cancellationWindowHours: 721 })
        .build();
      expect(() => TenantSettings.create(props)).toThrow(PlatformDomainError);
    });

    it('throws for invalid slotGranularityMinutes', () => {
      const props = new TenantSettingsPropsBuilder().build();
      (props.booking as { slotGranularityMinutes: number }).slotGranularityMinutes = 45;
      expect(() => TenantSettings.create(props)).toThrow(PlatformDomainError);
    });

    it('throws for non-integer welcomeStaffScreenDays', () => {
      const props = new TenantSettingsPropsBuilder()
        .withBooking({ welcomeStaffScreenDays: 7.5 })
        .build();
      expect(() => TenantSettings.create(props)).toThrow(PlatformDomainError);
    });

    it('throws for welcomeStaffScreenDays below 1', () => {
      const props = new TenantSettingsPropsBuilder()
        .withBooking({ welcomeStaffScreenDays: 0 })
        .build();
      expect(() => TenantSettings.create(props)).toThrow(PlatformDomainError);
    });

    it('throws for welcomeStaffScreenDays above 90', () => {
      const props = new TenantSettingsPropsBuilder()
        .withBooking({ welcomeStaffScreenDays: 91 })
        .build();
      expect(() => TenantSettings.create(props)).toThrow(PlatformDomainError);
    });

    it('accepts welcomeStaffScreenDays of 14 (default)', () => {
      const props = new TenantSettingsPropsBuilder()
        .withBooking({ welcomeStaffScreenDays: 14 })
        .build();
      expect(() => TenantSettings.create(props)).not.toThrow();
    });
  });

  describe('create() — localization validation', () => {
    it('throws for an unsupported country code', () => {
      const props = new TenantSettingsPropsBuilder()
        .withLocalization({ countryCode: 'ZZ' })
        .build();
      expect(() => TenantSettings.create(props)).toThrow(CountryCodeValidationError);
    });

    it('throws for decimalPlaces above 8', () => {
      const props = new TenantSettingsPropsBuilder().withLocalization({ decimalPlaces: 9 }).build();
      expect(() => TenantSettings.create(props)).toThrow(TenantSettingsValidationError);
    });

    it('accepts a valid localization payload', () => {
      const props = new TenantSettingsPropsBuilder()
        .withLocalization({
          countryCode: 'US',
          currency: 'USD',
          language: 'en',
          decimalPlaces: 2,
        })
        .build();
      expect(() => TenantSettings.create(props)).not.toThrow();
    });
  });

  describe('create() — businessHours validation', () => {
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

  describe('create() — notification validation', () => {
    it('accepts a null fromEmail (default)', () => {
      const props = new TenantSettingsPropsBuilder().build();
      expect(() => TenantSettings.create(props)).not.toThrow();
    });

    it('accepts a valid fromEmail and exposes it via the getter', () => {
      const props = new TenantSettingsPropsBuilder()
        .withNotification({ fromEmail: 'reservas@lavacar.com.br' })
        .build();
      const settings = TenantSettings.create(props);
      expect(settings.notification.fromEmail).toBe('reservas@lavacar.com.br');
    });

    it('throws for an invalid fromEmail', () => {
      const props = new TenantSettingsPropsBuilder()
        .withNotification({ fromEmail: 'not-an-email' })
        .build();
      expect(() => TenantSettings.create(props)).toThrow(PlatformDomainError);
    });
  });

  describe('create() — businessInfo validation', () => {
    const validAddress = {
      street: 'Av. Paulista',
      number: '1000',
      neighborhood: 'Bela Vista',
      city: 'São Paulo',
      state: 'SP',
      zipCode: '01310100',
    };

    it('accepts the default all-null businessInfo', () => {
      const props = new TenantSettingsPropsBuilder().build();
      expect(() => TenantSettings.create(props)).not.toThrow();
    });

    it('accepts a partial businessInfo with only phone set', () => {
      const props = new TenantSettingsPropsBuilder()
        .withBusinessInfo({ phone: '+5511987654321' })
        .build();
      const settings = TenantSettings.create(props);
      expect(settings.businessInfo).toEqual({
        phone: '+5511987654321',
        email: null,
        address: null,
        socialLinks: null,
      });
    });

    it('accepts a full businessInfo with a valid address', () => {
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

    it('throws for a zipCode that is not 8 digits', () => {
      const props = new TenantSettingsPropsBuilder()
        .withBusinessInfo({ address: { ...validAddress, zipCode: '123' } })
        .build();
      expect(() => TenantSettings.create(props)).toThrow(AddressValidationError);
    });

    it('throws for a state that is not a 2-letter uppercase UF', () => {
      const props = new TenantSettingsPropsBuilder()
        .withBusinessInfo({ address: { ...validAddress, state: 'sp' } })
        .build();
      expect(() => TenantSettings.create(props)).toThrow(AddressValidationError);
    });

    it('throws when the address is missing a required field', () => {
      const props = new TenantSettingsPropsBuilder()
        .withBusinessInfo({ address: { ...validAddress, street: '' } })
        .build();
      expect(() => TenantSettings.create(props)).toThrow(AddressValidationError);
    });

    it('accepts businessInfo with socialLinks set and exposes them via getter', () => {
      const props = new TenantSettingsPropsBuilder()
        .withBusinessInfo({ phone: '+5511987654321' })
        .withSocialLinks({
          whatsapp: '+5511987654321',
          instagram: 'https://instagram.com/lavacar',
          facebook: null,
        })
        .build();
      const settings = TenantSettings.create(props);
      expect(settings.businessInfo.socialLinks).toEqual({
        whatsapp: '+5511987654321',
        instagram: 'https://instagram.com/lavacar',
        facebook: null,
      });
    });

    it('toJSON() serialises socialLinks from businessInfo', () => {
      const props = new TenantSettingsPropsBuilder()
        .withSocialLinks({ whatsapp: '+5511987654321', instagram: null, facebook: null })
        .build();
      const settings = TenantSettings.create(props);
      expect(settings.toJSON().businessInfo!.socialLinks).toEqual({
        whatsapp: '+5511987654321',
        instagram: null,
        facebook: null,
      });
    });

    it('throws for an invalid socialLinks.whatsapp (not a phone number)', () => {
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
      loyalty.expiryDays = 9999;
      expect(settings.loyalty.expiryDays).toBe(180);
    });

    it('mutating booking getter result does not affect internal state', () => {
      const settings = TenantSettings.default();
      const booking = settings.booking;
      booking.cancellationWindowHours = 9999;
      expect(settings.booking.cancellationWindowHours).toBe(48);
    });

    it('mutating businessHours nested day does not affect internal state', () => {
      const settings = TenantSettings.default();
      const hours = settings.businessHours;
      hours.monday!.open = '00:00';
      expect(settings.businessHours.monday!.open).toBe('09:00');
    });

    it('toJSON returns a deep clone — mutating it does not affect internal state', () => {
      const settings = TenantSettings.default();
      const json = settings.toJSON();
      json.loyalty.expiryDays = 9999;
      json.businessHours.monday!.open = '00:00';
      expect(settings.loyalty.expiryDays).toBe(180);
      expect(settings.businessHours.monday!.open).toBe('09:00');
    });
  });
});
