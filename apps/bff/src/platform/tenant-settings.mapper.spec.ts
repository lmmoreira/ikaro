import { RawTenantSettingsResponse } from './tenant-settings.types';
import { toBackendSettingsBody, toTenantSettingsResponse } from './tenant-settings.mapper';

const rawResponse: RawTenantSettingsResponse = {
  tenantId: '10000000-0000-4000-8000-000000000001',
  name: 'Lavacar Estrela',
  slug: 'lavacar-estrela',
  settings: {
    loyalty: {
      expiry_days: 180,
      enable_notifications: true,
      expiry_warning_days: 7,
      notification_min_points: 10,
      points_per_currency_unit: 1,
    },
    booking: {
      cancellation_window_hours: 48,
      auto_approve_enabled: false,
      min_booking_advance_hours: 2,
      max_booking_advance_days: 60,
      service_buffer_minutes: 30,
      slot_granularity_minutes: 30,
    },
    business_hours: {
      timezone: 'America/Sao_Paulo',
      monday: { open: '08:00', close: '18:00' },
      tuesday: { open: '08:00', close: '18:00' },
      wednesday: { open: '08:00', close: '18:00' },
      thursday: { open: '08:00', close: '18:00' },
      friday: { open: '08:00', close: '18:00' },
      saturday: { open: '09:00', close: '14:00' },
      sunday: null,
    },
    localization: {
      country_code: 'BR',
      currency: 'BRL',
      currency_symbol: 'R$',
      language: 'pt-BR',
      decimal_places: 2,
    },
    notification: { from_email: 'lavagem@ikaro.com.br' },
    business_info: {
      phone: '+5511987654321',
      email: 'contato@lavacar.com.br',
      address: {
        street: 'Av. Paulista',
        number: '1000',
        complement: 'Sala 12',
        neighborhood: 'Bela Vista',
        city: 'São Paulo',
        state: 'SP',
        zip_code: '01310100',
      },
      social_links: { whatsapp: '+5511987654321', instagram: null, facebook: null },
    },
  },
};

describe('toTenantSettingsResponse', () => {
  it('maps the full snake_case backend shape to camelCase', () => {
    const result = toTenantSettingsResponse(rawResponse);

    expect(result.tenantId).toBe(rawResponse.tenantId);
    expect(result.name).toBe(rawResponse.name);
    expect(result.slug).toBe(rawResponse.slug);
    expect(result.loyalty).toEqual({
      expiryDays: 180,
      enableNotifications: true,
      expiryWarningDays: 7,
      notificationMinPoints: 10,
      pointsPerCurrencyUnit: 1,
    });
    expect(result.booking).toEqual({
      cancellationWindowHours: 48,
      autoApproveEnabled: false,
      minBookingAdvanceHours: 2,
      maxBookingAdvanceDays: 60,
      serviceBufferMinutes: 30,
      slotGranularityMinutes: 30,
    });
    expect(result.businessHours.timezone).toBe('America/Sao_Paulo');
    expect(result.businessHours.monday).toEqual({ open: '08:00', close: '18:00' });
    expect(result.businessHours.sunday).toBeNull();
    expect(result.localization).toEqual({
      countryCode: 'BR',
      currency: 'BRL',
      currencySymbol: 'R$',
      language: 'pt-BR',
      decimalPlaces: 2,
    });
    expect(result.notification).toEqual({ fromEmail: 'lavagem@ikaro.com.br' });
    expect(result.businessInfo).toEqual({
      phone: '+5511987654321',
      email: 'contato@lavacar.com.br',
      address: {
        street: 'Av. Paulista',
        number: '1000',
        complement: 'Sala 12',
        neighborhood: 'Bela Vista',
        city: 'São Paulo',
        state: 'SP',
        zipCode: '01310100',
      },
      socialLinks: { whatsapp: '+5511987654321', instagram: null, facebook: null },
    });
  });

  it('omits notification and businessInfo when absent on the backend response', () => {
    const minimal: RawTenantSettingsResponse = {
      ...rawResponse,
      settings: { ...rawResponse.settings, notification: undefined, business_info: undefined },
    };

    const result = toTenantSettingsResponse(minimal);

    expect(result.notification).toBeUndefined();
    expect(result.businessInfo).toBeUndefined();
  });
});

describe('toBackendSettingsBody', () => {
  it('maps a partial loyalty update to snake_case', () => {
    const result = toBackendSettingsBody({ loyalty: { expiryDays: 365 } });

    expect(result).toEqual({ settings: { loyalty: { expiry_days: 365 } } });
  });

  it('maps a partial booking update to snake_case without touching other categories', () => {
    const result = toBackendSettingsBody({ booking: { cancellationWindowHours: 72 } });

    expect(result).toEqual({ settings: { booking: { cancellation_window_hours: 72 } } });
  });

  it('maps business hours, preserving null days', () => {
    const result = toBackendSettingsBody({
      businessHours: { timezone: 'America/Manaus', sunday: null },
    });

    expect(result).toEqual({
      settings: { business_hours: { timezone: 'America/Manaus', sunday: null } },
    });
  });

  it('maps a partial business address, preserving untouched fields as omitted', () => {
    const result = toBackendSettingsBody({
      businessInfo: { address: { street: 'Av. Paulista', zipCode: '01310100' } },
    });

    expect(result).toEqual({
      settings: {
        business_info: { address: { street: 'Av. Paulista', zip_code: '01310100' } },
      },
    });
  });

  it('maps a null business address (clearing it)', () => {
    const result = toBackendSettingsBody({ businessInfo: { address: null } });

    expect(result).toEqual({ settings: { business_info: { address: null } } });
  });

  it('maps social links field-by-field', () => {
    const result = toBackendSettingsBody({
      businessInfo: { socialLinks: { whatsapp: '+5511999999999' } },
    });

    expect(result).toEqual({
      settings: { business_info: { social_links: { whatsapp: '+5511999999999' } } },
    });
  });

  it('returns an empty settings object when no category is provided', () => {
    const result = toBackendSettingsBody({});

    expect(result).toEqual({ settings: {} });
  });
});
