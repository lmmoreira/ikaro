import { TenantSettingsResponse } from '@ikaro/types';
import { makeBackendHttp } from '../../test/backend-http.mock';
import {
  TenantSettingsController,
  UpdateTenantSettingsBodySchema,
} from './tenant-settings.controller';

const settingsResponse: TenantSettingsResponse = {
  tenantId: '10000000-0000-4000-8000-000000000001',
  name: 'Lavacar Estrela',
  slug: 'lavacar-estrela',
  settings: {
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
  },
};

describe('TenantSettingsController', () => {
  afterEach(() => jest.resetAllMocks());

  describe('getSettings()', () => {
    it('calls GET /tenants/settings and returns the backend response unchanged', async () => {
      const backendHttp = makeBackendHttp({ get: jest.fn().mockResolvedValue(settingsResponse) });
      const controller = new TenantSettingsController(backendHttp);

      const result = await controller.getSettings();

      expect(backendHttp.get).toHaveBeenCalledWith('/tenants/settings');
      expect(result).toEqual(settingsResponse);
    });

    it('propagates errors from the backend', async () => {
      const backendHttp = makeBackendHttp({ get: jest.fn().mockRejectedValue(new Error('404')) });
      const controller = new TenantSettingsController(backendHttp);

      await expect(controller.getSettings()).rejects.toThrow('404');
    });
  });

  describe('updateSettings()', () => {
    it('calls PATCH /tenants/settings with the parsed body and returns the backend response', async () => {
      const backendHttp = makeBackendHttp({ patch: jest.fn().mockResolvedValue(settingsResponse) });
      const controller = new TenantSettingsController(backendHttp);
      const body = { settings: { loyalty: { expiryDays: 365 } } };

      const result = await controller.updateSettings(body);

      expect(backendHttp.patch).toHaveBeenCalledWith('/tenants/settings', body);
      expect(result).toEqual(settingsResponse);
    });

    it('propagates errors from the backend', async () => {
      const backendHttp = makeBackendHttp({ patch: jest.fn().mockRejectedValue(new Error('400')) });
      const controller = new TenantSettingsController(backendHttp);

      await expect(
        controller.updateSettings({ settings: { loyalty: { expiryDays: 90 } } }),
      ).rejects.toThrow('400');
    });
  });

  describe('UpdateTenantSettingsBodySchema', () => {
    it('rejects an empty settings object (no-op update)', () => {
      const result = UpdateTenantSettingsBodySchema.safeParse({ settings: {} });

      expect(result.success).toBe(false);
    });

    it('rejects an unknown key inside settings', () => {
      const result = UpdateTenantSettingsBodySchema.safeParse({
        settings: { notACategory: { foo: 'bar' } },
      });

      expect(result.success).toBe(false);
    });

    it('rejects a body with no settings field at all', () => {
      const result = UpdateTenantSettingsBodySchema.safeParse({});

      expect(result.success).toBe(false);
    });

    it('accepts a partial loyalty update', () => {
      const result = UpdateTenantSettingsBodySchema.safeParse({
        settings: { loyalty: { expiryDays: 90 } },
      });

      expect(result.success).toBe(true);
    });

    it('accepts a notification.fromEmail update', () => {
      const result = UpdateTenantSettingsBodySchema.safeParse({
        settings: { notification: { fromEmail: 'reservas@lavacar.com.br' } },
      });

      expect(result.success).toBe(true);
    });

    it('accepts notification.fromEmail set to null', () => {
      const result = UpdateTenantSettingsBodySchema.safeParse({
        settings: { notification: { fromEmail: null } },
      });

      expect(result.success).toBe(true);
    });

    it('accepts businessInfo.socialLinks set to null (all fields blank client-side)', () => {
      const result = UpdateTenantSettingsBodySchema.safeParse({
        settings: { businessInfo: { socialLinks: null } },
      });

      expect(result.success).toBe(true);
    });

    it('accepts a partial businessInfo.socialLinks object', () => {
      const result = UpdateTenantSettingsBodySchema.safeParse({
        settings: {
          businessInfo: {
            socialLinks: { whatsapp: '+5511987654321', instagram: null, facebook: null },
          },
        },
      });

      expect(result.success).toBe(true);
    });
  });
});
