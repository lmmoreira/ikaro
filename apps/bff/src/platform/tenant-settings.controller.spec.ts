import { TenantSettingsResponse } from '@ikaro/types';
import { makeBackendHttp } from '../test/backend-http.mock';
import { TenantSettingsController } from './tenant-settings.controller';
import { RawTenantSettingsResponse } from './tenant-settings.types';

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
  },
};

const expectedResponse: TenantSettingsResponse = {
  tenantId: rawResponse.tenantId,
  name: rawResponse.name,
  slug: rawResponse.slug,
  loyalty: {
    expiryDays: 180,
    enableNotifications: true,
    expiryWarningDays: 7,
    notificationMinPoints: 10,
    pointsPerCurrencyUnit: 1,
  },
  booking: {
    cancellationWindowHours: 48,
    autoApproveEnabled: false,
    minBookingAdvanceHours: 2,
    maxBookingAdvanceDays: 60,
    serviceBufferMinutes: 30,
    slotGranularityMinutes: 30,
  },
  businessHours: {
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
    countryCode: 'BR',
    currency: 'BRL',
    currencySymbol: 'R$',
    language: 'pt-BR',
    decimalPlaces: 2,
  },
  notification: undefined,
  businessInfo: undefined,
};

describe('TenantSettingsController', () => {
  afterEach(() => jest.resetAllMocks());

  describe('getSettings()', () => {
    it('calls GET /tenants/settings and returns the camelCase response', async () => {
      const backendHttp = makeBackendHttp({ get: jest.fn().mockResolvedValue(rawResponse) });
      const controller = new TenantSettingsController(backendHttp);

      const result = await controller.getSettings();

      expect(backendHttp.get).toHaveBeenCalledWith('/tenants/settings');
      expect(result).toEqual(expectedResponse);
    });

    it('propagates errors from the backend', async () => {
      const backendHttp = makeBackendHttp({ get: jest.fn().mockRejectedValue(new Error('404')) });
      const controller = new TenantSettingsController(backendHttp);

      await expect(controller.getSettings()).rejects.toThrow('404');
    });
  });

  describe('updateSettings()', () => {
    it('maps the camelCase body to snake_case, calls PATCH, and returns the camelCase response', async () => {
      const backendHttp = makeBackendHttp({ patch: jest.fn().mockResolvedValue(rawResponse) });
      const controller = new TenantSettingsController(backendHttp);

      const result = await controller.updateSettings({
        settings: { loyalty: { expiryDays: 365 } },
      });

      expect(backendHttp.patch).toHaveBeenCalledWith('/tenants/settings', {
        settings: { loyalty: { expiry_days: 365 } },
      });
      expect(result).toEqual(expectedResponse);
    });

    it('propagates errors from the backend', async () => {
      const backendHttp = makeBackendHttp({ patch: jest.fn().mockRejectedValue(new Error('400')) });
      const controller = new TenantSettingsController(backendHttp);

      await expect(
        controller.updateSettings({ settings: { loyalty: { expiryDays: 90 } } }),
      ).rejects.toThrow('400');
    });
  });
});
