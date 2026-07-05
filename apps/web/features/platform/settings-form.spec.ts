import { describe, expect, it } from 'vitest';
import type { TenantSettingsResponse } from '@ikaro/types';
import {
  resolveSettingsLocalization,
  toSettingsFormValues,
  validateSettingsForm,
  type SettingsFormValues,
} from './settings-form';

const t = (key: string): string => key;
const BR = 'BR';

function buildTenant(overrides?: Partial<TenantSettingsResponse>): TenantSettingsResponse {
  return {
    tenantId: 'tenant-1',
    name: 'BeloAuto Demo',
    slug: 'beloauto',
    settings: {
      loyalty: {
        expiryDays: 180,
        enableNotifications: true,
        expiryWarningDays: 15,
        notificationMinPoints: 10,
        pointsPerCurrencyUnit: 10,
      },
      booking: {
        cancellationWindowHours: 48,
        autoApproveEnabled: false,
        minBookingAdvanceHours: 2,
        maxBookingAdvanceDays: 60,
        serviceBufferMinutes: 60,
        slotGranularityMinutes: 30,
        welcomeStaffScreenDays: 14,
      },
      businessHours: {
        timezone: 'America/Sao_Paulo',
        monday: { open: '08:00', close: '18:00' },
        tuesday: { open: '08:00', close: '18:00' },
        wednesday: { open: '08:00', close: '18:00' },
        thursday: { open: '08:00', close: '18:00' },
        friday: { open: '08:00', close: '18:00' },
        saturday: { open: '09:00', close: '13:00' },
        sunday: null,
      },
      localization: {
        countryCode: 'BR',
        currency: 'BRL',
        currencySymbol: 'R$',
        language: 'pt-BR',
        decimalPlaces: 2,
      },
      businessInfo: {
        phone: '+5531999999999',
        email: 'contato@beloauto.com.br',
        address: {
          street: 'Rua das Flores',
          number: '123',
          neighborhood: 'Centro',
          city: 'Belo Horizonte',
          state: 'MG',
          zipCode: '30000-000',
        },
        socialLinks: null,
      },
      notification: { fromEmail: null },
    },
    ...overrides,
  };
}

function validValues(overrides?: Partial<SettingsFormValues>): SettingsFormValues {
  return { ...toSettingsFormValues(buildTenant()), ...overrides };
}

const BLANK_ADDRESS = {
  street: '',
  number: '',
  complement: '',
  neighborhood: '',
  city: '',
  state: '',
  zipCode: '',
};

describe('toSettingsFormValues', () => {
  it('maps the tenant response into string form values', () => {
    const values = toSettingsFormValues(buildTenant());

    expect(values.name).toBe('BeloAuto Demo');
    expect(values.cancellationWindowHours).toBe('48');
    expect(values.serviceBufferMinutes).toBe('60');
    expect(values.loyaltyExpiryDays).toBe('180');
    expect(values.pointsPerCurrencyUnit).toBe('10');
    expect(values.timezone).toBe('America/Sao_Paulo');
    expect(values.phone).toBe('31999999999');
    expect(values.email).toBe('contato@beloauto.com.br');
    expect(values.address.street).toBe('Rua das Flores');
    expect(values.address.complement).toBe('');
    expect(values.autoApproveEnabled).toBe(false);
    expect(values.minBookingAdvanceHours).toBe('2');
    expect(values.maxBookingAdvanceDays).toBe('60');
    expect(values.slotGranularityMinutes).toBe('30');
    expect(values.welcomeStaffScreenDays).toBe('14');
    expect(values.loyaltyExpiryWarningDays).toBe('15');
    expect(values.loyaltyEnableNotifications).toBe(true);
    expect(values.loyaltyNotificationMinPoints).toBe('10');
    expect(values.notificationFromEmail).toBe('');
    expect(values.socialLinks).toEqual({ whatsapp: '', instagram: '', facebook: '' });
  });

  it('defaults welcomeStaffScreenDays to 14 when absent (matches backend reconstitute())', () => {
    const tenant = buildTenant();
    const bookingWithoutWelcome = { ...tenant.settings.booking };
    delete bookingWithoutWelcome.welcomeStaffScreenDays;
    const values = toSettingsFormValues({
      ...tenant,
      settings: { ...tenant.settings, booking: bookingWithoutWelcome },
    });

    expect(values.welcomeStaffScreenDays).toBe('14');
  });

  it('strips the +55 prefix from socialLinks.whatsapp the same way as the main phone', () => {
    const tenant = buildTenant();
    const values = toSettingsFormValues({
      ...tenant,
      settings: {
        ...tenant.settings,
        businessInfo: {
          ...tenant.settings.businessInfo!,
          socialLinks: {
            whatsapp: '+5531988887777',
            instagram: 'https://instagram.com/beloauto',
            facebook: null,
          },
        },
      },
    });

    expect(values.socialLinks).toEqual({
      whatsapp: '31988887777',
      instagram: 'https://instagram.com/beloauto',
      facebook: '',
    });
  });

  it('marks a null day as closed with default times', () => {
    const values = toSettingsFormValues(buildTenant());

    expect(values.days.sunday).toEqual({ open: '09:00', close: '18:00', closed: true });
    expect(values.days.monday).toEqual({ open: '08:00', close: '18:00', closed: false });
  });

  it('handles a tenant without businessInfo', () => {
    const tenant = buildTenant();
    const values = toSettingsFormValues({
      ...tenant,
      settings: { ...tenant.settings, businessInfo: undefined },
    });

    expect(values.phone).toBe('');
    expect(values.email).toBe('');
    expect(values.address.city).toBe('');
  });
});

describe('validateSettingsForm', () => {
  it('normalizes a valid form into the PATCH payload plus name', () => {
    const { errors, normalized } = validateSettingsForm(validValues(), BR, t);

    expect(errors).toEqual({});
    expect(normalized).not.toBeNull();
    expect(normalized?.name).toBe('BeloAuto Demo');
    expect(normalized?.settings.booking).toEqual({
      cancellationWindowHours: 48,
      serviceBufferMinutes: 60,
      autoApproveEnabled: false,
      minBookingAdvanceHours: 2,
      maxBookingAdvanceDays: 60,
      slotGranularityMinutes: 30,
      welcomeStaffScreenDays: 14,
    });
    expect(normalized?.settings.loyalty).toEqual({
      expiryDays: 180,
      expiryWarningDays: 15,
      enableNotifications: true,
      notificationMinPoints: 10,
      pointsPerCurrencyUnit: 10,
    });
    expect(normalized?.settings.businessHours?.sunday).toBeNull();
    expect(normalized?.settings.businessHours?.monday).toEqual({ open: '08:00', close: '18:00' });
    expect(normalized?.settings.businessInfo?.phone).toBe('+5531999999999');
    expect(normalized?.settings.notification).toEqual({ fromEmail: null });
  });

  it('rejects an empty name', () => {
    const { errors, normalized } = validateSettingsForm(validValues({ name: '  ' }), BR, t);

    expect(errors.name).toBe('errors.nameRequired');
    expect(normalized).toBeNull();
  });

  it('rejects cancellationWindowHours above 720 and keeps other fields error-free', () => {
    const { errors } = validateSettingsForm(validValues({ cancellationWindowHours: '721' }), BR, t);

    expect(errors.cancellationWindowHours).toBe('errors.cancellationWindowMax');
    expect(errors.serviceBufferMinutes).toBeUndefined();
    expect(errors.name).toBeUndefined();
  });

  it('rejects non-numeric numeric fields with the same field message', () => {
    const { errors } = validateSettingsForm(validValues({ serviceBufferMinutes: 'abc' }), BR, t);

    expect(errors.serviceBufferMinutes).toBe('errors.bufferMax');
  });

  it('rejects loyaltyExpiryDays of 0 (minimum is 1)', () => {
    const { errors } = validateSettingsForm(validValues({ loyaltyExpiryDays: '0' }), BR, t);

    expect(errors.loyaltyExpiryDays).toBe('errors.expiryRange');
  });

  it('accepts pointsPerCurrencyUnit of 0 and rejects values above 10000', () => {
    const zero = validateSettingsForm(validValues({ pointsPerCurrencyUnit: '0' }), BR, t);
    expect(zero.errors).toEqual({});
    expect(zero.normalized?.settings.loyalty?.pointsPerCurrencyUnit).toBe(0);

    const over = validateSettingsForm(validValues({ pointsPerCurrencyUnit: '10001' }), BR, t);
    expect(over.errors.pointsPerCurrencyUnit).toBe('errors.pointsMax');
  });

  it('rejects a timezone outside the supported list', () => {
    const { errors } = validateSettingsForm(validValues({ timezone: 'Europe/Lisbon' }), BR, t);

    expect(errors.timezone).toBe('errors.timezoneInvalid');
  });

  it('derives the valid timezone list from the tenant country, not a hardcoded constant', () => {
    // BR: America/Sao_Paulo is valid, America/New_York is not.
    expect(validateSettingsForm(validValues(), BR, t).errors.timezone).toBeUndefined();
    expect(
      validateSettingsForm(validValues({ timezone: 'America/New_York' }), BR, t).errors.timezone,
    ).toBe('errors.timezoneInvalid');

    // US: America/New_York is valid, America/Sao_Paulo is not.
    const usValues = { ...validValues(), timezone: 'America/New_York' };
    expect(validateSettingsForm(usValues, 'US', t).errors.timezone).toBeUndefined();
    expect(
      validateSettingsForm(validValues({ timezone: 'America/Sao_Paulo' }), 'US', t).errors.timezone,
    ).toBe('errors.timezoneInvalid');
  });

  it('resolveSettingsLocalization exposes the country-specific timezone list', () => {
    expect(resolveSettingsLocalization('BR').timezones).toContain('America/Sao_Paulo');
    expect(resolveSettingsLocalization('BR').timezones).not.toContain('America/New_York');
    expect(resolveSettingsLocalization('US').timezones).toContain('America/New_York');
  });

  it('strips phone formatting and builds the full E.164 value for the +55 prefix', () => {
    const formatted = validateSettingsForm(validValues({ phone: '(31) 99999-9999' }), BR, t);
    expect(formatted.errors).toEqual({});
    expect(formatted.normalized?.settings.businessInfo?.phone).toBe('+5531999999999');

    const short = validateSettingsForm(validValues({ phone: '12345' }), BR, t);
    expect(short.errors.phone).toBe('errors.phoneInvalid');
  });

  it('accepts a 10-digit BR landline (no mobile 9th digit)', () => {
    const { errors, normalized } = validateSettingsForm(
      validValues({ phone: '3133334444' }),
      BR,
      t,
    );

    expect(errors.phone).toBeUndefined();
    expect(normalized?.settings.businessInfo?.phone).toBe('+553133334444');
  });

  it('treats empty phone and email as null (optional fields)', () => {
    const { errors, normalized } = validateSettingsForm(
      validValues({ phone: '', email: '' }),
      BR,
      t,
    );

    expect(errors).toEqual({});
    expect(normalized?.settings.businessInfo?.phone).toBeNull();
    expect(normalized?.settings.businessInfo?.email).toBeNull();
  });

  it('rejects an invalid email', () => {
    const { errors } = validateSettingsForm(validValues({ email: 'not-an-email' }), BR, t);

    expect(errors.email).toBe('errors.emailInvalid');
  });

  it('omits complement when empty', () => {
    const base = validValues();
    const { errors, normalized } = validateSettingsForm(
      validValues({ address: { ...base.address, complement: '' } }),
      BR,
      t,
    );

    expect(errors).toEqual({});
    expect(normalized?.settings.businessInfo?.address).not.toHaveProperty('complement');
  });

  it('sends a day as null when marked closed', () => {
    const base = validValues();
    const { normalized } = validateSettingsForm(
      validValues({ days: { ...base.days, monday: { ...base.days.monday, closed: true } } }),
      BR,
      t,
    );

    expect(normalized?.settings.businessHours?.monday).toBeNull();
  });

  describe('business address (optional, all-or-nothing per backend contract)', () => {
    it('sends address: null when every field is left blank', () => {
      const { errors, normalized } = validateSettingsForm(
        validValues({ address: BLANK_ADDRESS }),
        BR,
        t,
      );

      expect(errors).toEqual({});
      expect(normalized?.settings.businessInfo?.address).toBeNull();
    });

    it('requires the remaining fields once any single address field is filled in', () => {
      const { errors, normalized } = validateSettingsForm(
        validValues({ address: { ...BLANK_ADDRESS, city: 'Belo Horizonte' } }),
        BR,
        t,
      );

      expect(errors.addressStreet).toBe('errors.addressStreetRequired');
      expect(errors.addressNumber).toBe('errors.addressNumberRequired');
      expect(errors.addressNeighborhood).toBe('errors.addressNeighborhoodRequired');
      expect(errors.addressState).toBe('errors.addressStateRequired');
      expect(errors.addressZipCode).toBe('errors.addressZipCodeRequired');
      expect(errors.addressCity).toBeUndefined();
      expect(normalized).toBeNull();
    });

    it('accepts a CEP with or without the hyphen', () => {
      const base = validValues();
      const withHyphen = validateSettingsForm(
        validValues({ address: { ...base.address, zipCode: '30130-100' } }),
        BR,
        t,
      );
      expect(withHyphen.errors.addressZipCode).toBeUndefined();

      const withoutHyphen = validateSettingsForm(
        validValues({ address: { ...base.address, zipCode: '30130100' } }),
        BR,
        t,
      );
      expect(withoutHyphen.errors.addressZipCode).toBeUndefined();
    });

    it('rejects a CEP that does not match 5+3 digits', () => {
      const base = validValues();
      const { errors, normalized } = validateSettingsForm(
        validValues({ address: { ...base.address, zipCode: '3013-10' } }),
        BR,
        t,
      );

      expect(errors.addressZipCode).toBe('errors.addressZipCodeInvalid');
      expect(normalized).toBeNull();
    });

    it('uppercases a lowercase state code before validating and submitting', () => {
      const base = validValues();
      const { errors, normalized } = validateSettingsForm(
        validValues({ address: { ...base.address, state: 'mg' } }),
        BR,
        t,
      );

      expect(errors.addressState).toBeUndefined();
      expect(normalized?.settings.businessInfo?.address?.state).toBe('MG');
    });

    it('rejects a state code that is not 2 letters', () => {
      const base = validValues();
      const { errors, normalized } = validateSettingsForm(
        validValues({ address: { ...base.address, state: 'MG2' } }),
        BR,
        t,
      );

      expect(errors.addressState).toBe('errors.addressStateInvalid');
      expect(normalized).toBeNull();
    });
  });

  describe('booking queue/availability fields', () => {
    it('normalizes autoApproveEnabled, minBookingAdvanceHours, maxBookingAdvanceDays, slotGranularityMinutes, welcomeStaffScreenDays', () => {
      const { errors, normalized } = validateSettingsForm(
        validValues({
          autoApproveEnabled: true,
          minBookingAdvanceHours: '4',
          maxBookingAdvanceDays: '30',
          slotGranularityMinutes: '15',
          welcomeStaffScreenDays: '7',
        }),
        BR,
        t,
      );

      expect(errors).toEqual({});
      expect(normalized?.settings.booking).toMatchObject({
        autoApproveEnabled: true,
        minBookingAdvanceHours: 4,
        maxBookingAdvanceDays: 30,
        slotGranularityMinutes: 15,
        welcomeStaffScreenDays: 7,
      });
    });

    it('rejects a slotGranularityMinutes value outside 15/30/60', () => {
      const { errors, normalized } = validateSettingsForm(
        validValues({ slotGranularityMinutes: '20' }),
        BR,
        t,
      );

      expect(errors.slotGranularityMinutes).toBe('errors.slotGranularityInvalid');
      expect(normalized).toBeNull();
    });

    it('rejects maxBookingAdvanceDays below 1', () => {
      const { errors, normalized } = validateSettingsForm(
        validValues({ maxBookingAdvanceDays: '0' }),
        BR,
        t,
      );

      expect(errors.maxBookingAdvanceDays).toBe('errors.maxBookingAdvanceDaysInvalid');
      expect(normalized).toBeNull();
    });

    it('rejects welcomeStaffScreenDays outside 1..90', () => {
      const { errors, normalized } = validateSettingsForm(
        validValues({ welcomeStaffScreenDays: '91' }),
        BR,
        t,
      );

      expect(errors.welcomeStaffScreenDays).toBe('errors.welcomeStaffScreenDaysRange');
      expect(normalized).toBeNull();
    });
  });

  describe('loyalty notification fields', () => {
    it('normalizes expiryWarningDays and enableNotifications', () => {
      const { errors, normalized } = validateSettingsForm(
        validValues({ loyaltyExpiryWarningDays: '10', loyaltyEnableNotifications: false }),
        BR,
        t,
      );

      expect(errors).toEqual({});
      expect(normalized?.settings.loyalty).toMatchObject({
        expiryWarningDays: 10,
        enableNotifications: false,
      });
    });

    it('rejects expiryWarningDays equal to expiryDays (must be strictly less)', () => {
      const { errors, normalized } = validateSettingsForm(
        validValues({ loyaltyExpiryDays: '30', loyaltyExpiryWarningDays: '30' }),
        BR,
        t,
      );

      expect(errors.loyaltyExpiryWarningDays).toBe('errors.expiryWarningMustBeLessThanExpiry');
      expect(normalized).toBeNull();
    });

    it('rejects expiryWarningDays above 90', () => {
      const { errors, normalized } = validateSettingsForm(
        validValues({ loyaltyExpiryWarningDays: '91' }),
        BR,
        t,
      );

      expect(errors.loyaltyExpiryWarningDays).toBe('errors.expiryWarningRange');
      expect(normalized).toBeNull();
    });

    it('accepts notificationMinPoints of 0 and rejects values above 10000', () => {
      const zero = validateSettingsForm(validValues({ loyaltyNotificationMinPoints: '0' }), BR, t);
      expect(zero.errors).toEqual({});
      expect(zero.normalized?.settings.loyalty?.notificationMinPoints).toBe(0);

      const over = validateSettingsForm(
        validValues({ loyaltyNotificationMinPoints: '10001' }),
        BR,
        t,
      );
      expect(over.errors.loyaltyNotificationMinPoints).toBe('errors.notificationMinPointsMax');
      expect(over.normalized).toBeNull();
    });
  });

  describe('notification.fromEmail', () => {
    it('accepts a blank value as null', () => {
      const { errors, normalized } = validateSettingsForm(
        validValues({ notificationFromEmail: '' }),
        BR,
        t,
      );

      expect(errors).toEqual({});
      expect(normalized?.settings.notification).toEqual({ fromEmail: null });
    });

    it('accepts a valid email', () => {
      const { errors, normalized } = validateSettingsForm(
        validValues({ notificationFromEmail: 'reservas@lavacar.com.br' }),
        BR,
        t,
      );

      expect(errors).toEqual({});
      expect(normalized?.settings.notification).toEqual({ fromEmail: 'reservas@lavacar.com.br' });
    });

    it('rejects an invalid email', () => {
      const { errors, normalized } = validateSettingsForm(
        validValues({ notificationFromEmail: 'not-an-email' }),
        BR,
        t,
      );

      expect(errors.notificationFromEmail).toBe('errors.notificationFromEmailInvalid');
      expect(normalized).toBeNull();
    });
  });

  describe('businessInfo.socialLinks', () => {
    it('sends socialLinks: null when all three fields are blank', () => {
      const { errors, normalized } = validateSettingsForm(
        validValues({ socialLinks: { whatsapp: '', instagram: '', facebook: '' } }),
        BR,
        t,
      );

      expect(errors).toEqual({});
      expect(normalized?.settings.businessInfo?.socialLinks).toBeNull();
    });

    it('builds the full E.164 whatsapp value the same way as the main phone field', () => {
      const { errors, normalized } = validateSettingsForm(
        validValues({
          socialLinks: { whatsapp: '31988887777', instagram: '', facebook: '' },
        }),
        BR,
        t,
      );

      expect(errors).toEqual({});
      expect(normalized?.settings.businessInfo?.socialLinks).toEqual({
        whatsapp: '+5531988887777',
        instagram: null,
        facebook: null,
      });
    });

    it('rejects an invalid whatsapp number with its own inline error', () => {
      const { errors, normalized } = validateSettingsForm(
        validValues({ socialLinks: { whatsapp: '123', instagram: '', facebook: '' } }),
        BR,
        t,
      );

      expect(errors.socialLinksWhatsapp).toBe('errors.socialLinksWhatsappInvalid');
      expect(normalized).toBeNull();
    });

    it('keeps instagram/facebook independent of whatsapp', () => {
      const { errors, normalized } = validateSettingsForm(
        validValues({
          socialLinks: {
            whatsapp: '',
            instagram: 'https://instagram.com/beloauto',
            facebook: 'https://facebook.com/beloauto',
          },
        }),
        BR,
        t,
      );

      expect(errors).toEqual({});
      expect(normalized?.settings.businessInfo?.socialLinks).toEqual({
        whatsapp: null,
        instagram: 'https://instagram.com/beloauto',
        facebook: 'https://facebook.com/beloauto',
      });
    });
  });
});
