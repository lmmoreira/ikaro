import { describe, expect, it } from 'vitest';
import type { TenantSettingsResponse } from '@ikaro/types';
import {
  toSettingsFormValues,
  validateSettingsForm,
  type SettingsFormValues,
} from './settings-form';

const t = (key: string): string => key;

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
        phone: '31999999999',
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
    },
    ...overrides,
  };
}

function validValues(overrides?: Partial<SettingsFormValues>): SettingsFormValues {
  return { ...toSettingsFormValues(buildTenant()), ...overrides };
}

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
    const { errors, normalized } = validateSettingsForm(validValues(), t);

    expect(errors).toEqual({});
    expect(normalized).not.toBeNull();
    expect(normalized?.name).toBe('BeloAuto Demo');
    expect(normalized?.settings.booking).toEqual({
      cancellationWindowHours: 48,
      serviceBufferMinutes: 60,
    });
    expect(normalized?.settings.loyalty).toEqual({ expiryDays: 180, pointsPerCurrencyUnit: 10 });
    expect(normalized?.settings.businessHours?.sunday).toBeNull();
    expect(normalized?.settings.businessHours?.monday).toEqual({ open: '08:00', close: '18:00' });
    expect(normalized?.settings.businessInfo?.phone).toBe('31999999999');
  });

  it('rejects an empty name', () => {
    const { errors, normalized } = validateSettingsForm(validValues({ name: '  ' }), t);

    expect(errors.name).toBe('errors.nameRequired');
    expect(normalized).toBeNull();
  });

  it('rejects cancellationWindowHours above 720 and keeps other fields error-free', () => {
    const { errors } = validateSettingsForm(validValues({ cancellationWindowHours: '721' }), t);

    expect(errors.cancellationWindowHours).toBe('errors.cancellationWindowMax');
    expect(errors.serviceBufferMinutes).toBeUndefined();
    expect(errors.name).toBeUndefined();
  });

  it('rejects non-numeric numeric fields with the same field message', () => {
    const { errors } = validateSettingsForm(validValues({ serviceBufferMinutes: 'abc' }), t);

    expect(errors.serviceBufferMinutes).toBe('errors.bufferMax');
  });

  it('rejects loyaltyExpiryDays of 0 (minimum is 1)', () => {
    const { errors } = validateSettingsForm(validValues({ loyaltyExpiryDays: '0' }), t);

    expect(errors.loyaltyExpiryDays).toBe('errors.expiryRange');
  });

  it('accepts pointsPerCurrencyUnit of 0 and rejects values above 10000', () => {
    const zero = validateSettingsForm(validValues({ pointsPerCurrencyUnit: '0' }), t);
    expect(zero.errors).toEqual({});
    expect(zero.normalized?.settings.loyalty?.pointsPerCurrencyUnit).toBe(0);

    const over = validateSettingsForm(validValues({ pointsPerCurrencyUnit: '10001' }), t);
    expect(over.errors.pointsPerCurrencyUnit).toBe('errors.pointsMax');
  });

  it('rejects a timezone outside the supported list', () => {
    const { errors } = validateSettingsForm(validValues({ timezone: 'Europe/Lisbon' }), t);

    expect(errors.timezone).toBe('errors.timezoneInvalid');
  });

  it('strips phone formatting and validates digit count', () => {
    const formatted = validateSettingsForm(validValues({ phone: '(31) 99999-9999' }), t);
    expect(formatted.errors).toEqual({});
    expect(formatted.normalized?.settings.businessInfo?.phone).toBe('31999999999');

    const short = validateSettingsForm(validValues({ phone: '12345' }), t);
    expect(short.errors.phone).toBe('errors.phoneInvalid');
  });

  it('treats empty phone and email as null (optional fields)', () => {
    const { errors, normalized } = validateSettingsForm(validValues({ phone: '', email: '' }), t);

    expect(errors).toEqual({});
    expect(normalized?.settings.businessInfo?.phone).toBeNull();
    expect(normalized?.settings.businessInfo?.email).toBeNull();
  });

  it('rejects an invalid email', () => {
    const { errors } = validateSettingsForm(validValues({ email: 'not-an-email' }), t);

    expect(errors.email).toBe('errors.emailInvalid');
  });

  it('omits complement when empty and nulls empty address fields', () => {
    const base = validValues();
    const { normalized } = validateSettingsForm(
      validValues({ address: { ...base.address, complement: '', city: ' ' } }),
      t,
    );

    expect(normalized?.settings.businessInfo?.address).not.toHaveProperty('complement');
    expect(normalized?.settings.businessInfo?.address?.city).toBeNull();
  });

  it('sends a day as null when marked closed', () => {
    const base = validValues();
    const { normalized } = validateSettingsForm(
      validValues({ days: { ...base.days, monday: { ...base.days.monday, closed: true } } }),
      t,
    );

    expect(normalized?.settings.businessHours?.monday).toBeNull();
  });
});
