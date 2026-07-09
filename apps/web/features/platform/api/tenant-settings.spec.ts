import MockAdapter from 'axios-mock-adapter';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bffClient } from '@/shared/lib/api/bff-client';
import {
  deleteHotsiteImage,
  featureBookingPhoto,
  generateHotsiteImageReadSignedUrl,
  generateHotsiteImageSignedUrl,
  getHotsiteConfig,
  publishHotsite,
  resolveTenantFormatting,
  resolveWelcomeStaffScreenDays,
  unpublishHotsite,
  updateHotsiteConfig,
} from './tenant-settings';
import {
  fetchHotsiteConfig,
  fetchTenantSettings,
  fetchTenantSettingsFresh,
} from './tenant-settings.server';

const mock = new MockAdapter(bffClient);

beforeEach(() => mock.reset());
afterEach(() => mock.reset());

const hotsiteConfig = { id: 'h-1', branding: {}, layout: [], seo: {} };

const tenantSettingsResponse = {
  tenantId: 'tenant-1',
  name: 'Lavacar',
  slug: 'lavacar',
  settings: {
    loyalty: {
      expiryDays: 180,
      enableNotifications: true,
      expiryWarningDays: 7,
      notificationMinPoints: 50,
      pointsPerCurrencyUnit: 0,
    },
    booking: {
      cancellationWindowHours: 48,
      autoApproveEnabled: false,
      minBookingAdvanceHours: 0,
      maxBookingAdvanceDays: 90,
      serviceBufferMinutes: 60,
      slotGranularityMinutes: 30,
      welcomeStaffScreenDays: 21,
    },
    businessHours: {
      timezone: 'America/Sao_Paulo',
      monday: { open: '09:00', close: '18:00' },
      tuesday: { open: '09:00', close: '18:00' },
      wednesday: { open: '09:00', close: '18:00' },
      thursday: { open: '09:00', close: '18:00' },
      friday: { open: '09:00', close: '18:00' },
      saturday: { open: '09:00', close: '17:00' },
      sunday: null,
    },
    localization: {
      countryCode: 'BR',
      currency: 'BRL',
      language: 'pt-BR',
      decimalPlaces: 2,
    },
    notification: { fromEmail: null },
    businessInfo: {
      phone: null,
      email: null,
      address: null,
      socialLinks: null,
    },
  },
} as const;

describe('getHotsiteConfig', () => {
  it('calls GET /tenants/hotsite', async () => {
    mock.onGet('/tenants/hotsite').reply(200, hotsiteConfig);
    const res = await getHotsiteConfig();
    expect(res).toMatchObject(hotsiteConfig);
  });
});

describe('fetchHotsiteConfig', () => {
  it('fetches GET /tenants/hotsite with cookie header, uncached', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: () => Promise.resolve(hotsiteConfig) });
    vi.stubGlobal('fetch', fetchMock);
    process.env.NEXT_PUBLIC_BFF_URL = 'http://bff.test/v1';

    const res = await fetchHotsiteConfig('test-token');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://bff.test/v1/tenants/hotsite',
      expect.objectContaining({
        headers: { Cookie: 'access_token=test-token' },
        cache: 'no-store',
      }),
    );
    expect(res).toEqual(hotsiteConfig);
    vi.unstubAllGlobals();
  });

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));

    await expect(fetchHotsiteConfig('bad-token')).rejects.toThrow('Failed to fetch hotsite config');
    vi.unstubAllGlobals();
  });
});

describe('updateHotsiteConfig', () => {
  it('calls PATCH /tenants/hotsite', async () => {
    mock.onPatch('/tenants/hotsite').reply(200, hotsiteConfig);
    const res = await updateHotsiteConfig({ branding: { brandName: 'Acme' } });
    expect(res).toMatchObject(hotsiteConfig);
  });
});

describe('publishHotsite', () => {
  it('calls POST /tenants/hotsite/publish', async () => {
    mock.onPost('/tenants/hotsite/publish').reply(200, { publishedAt: '2026-07-01T00:00:00Z' });
    const res = await publishHotsite();
    expect(res).toMatchObject({ publishedAt: '2026-07-01T00:00:00Z' });
  });
});

describe('unpublishHotsite', () => {
  it('calls POST /tenants/hotsite/unpublish', async () => {
    mock.onPost('/tenants/hotsite/unpublish').reply(200, { unpublishedAt: '2026-07-01T00:00:00Z' });
    const res = await unpublishHotsite();
    expect(res).toMatchObject({ unpublishedAt: '2026-07-01T00:00:00Z' });
  });
});

describe('generateHotsiteImageSignedUrl', () => {
  it('calls POST /tenants/hotsite/images/signed-url', async () => {
    const response = {
      signedUrl: 'https://storage.example.com/upload',
      filePath: 'tenants/t-1/hotsite/logo.jpg',
      expiresAt: '',
    };
    mock.onPost('/tenants/hotsite/images/signed-url').reply(201, response);
    const res = await generateHotsiteImageSignedUrl({
      fileName: 'logo.jpg',
      contentType: 'image/jpeg',
      purpose: 'branding',
    });
    expect(res.signedUrl).toContain('https://');
  });
});

describe('generateHotsiteImageReadSignedUrl', () => {
  it('calls POST /tenants/hotsite/images/read-signed-url with the filePath', async () => {
    const response = { signedUrl: 'https://storage.example.com/read', expiresAt: '' };
    mock.onPost('/tenants/hotsite/images/read-signed-url').reply(201, response);

    const res = await generateHotsiteImageReadSignedUrl('tmp/t-1/branding/u1/logo.png');

    expect(res.signedUrl).toContain('https://');
    expect(mock.history.post?.at(-1)?.data).toBe(
      JSON.stringify({ filePath: 'tmp/t-1/branding/u1/logo.png' }),
    );
  });
});

describe('featureBookingPhoto', () => {
  it('calls POST /tenants/hotsite/gallery/feature-booking-photo', async () => {
    mock.onPost('/tenants/hotsite/gallery/feature-booking-photo').reply(200, { success: true });
    const res = await featureBookingPhoto({
      bookingId: 'b-1',
      photoType: 'after',
      filePath: 'tenants/t-1/bookings/b-1/photo.jpg',
    });
    expect(res).toMatchObject({ success: true });
  });
});

describe('deleteHotsiteImage', () => {
  it('calls POST /tenants/hotsite/images/delete with the filePath', async () => {
    mock.onPost('/tenants/hotsite/images/delete').reply(204);

    await deleteHotsiteImage('tenants/t-1/hotsite/branding/u1/logo.png');

    expect(mock.history.post?.at(-1)?.data).toBe(
      JSON.stringify({ filePath: 'tenants/t-1/hotsite/branding/u1/logo.png' }),
    );
  });
});

describe('fetchTenantSettings', () => {
  it('fetches GET /tenants/settings with cookie header and returns tenant settings', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: () => Promise.resolve(tenantSettingsResponse) });
    vi.stubGlobal('fetch', fetchMock);
    process.env.NEXT_PUBLIC_BFF_URL = 'http://bff.test/v1';

    const res = await fetchTenantSettings('test-token');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://bff.test/v1/tenants/settings',
      expect.objectContaining({
        headers: { Cookie: 'access_token=test-token' },
        next: { revalidate: 300 },
      }),
    );
    expect(res).toEqual(tenantSettingsResponse);
    vi.unstubAllGlobals();
  });

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));

    await expect(fetchTenantSettings('bad-token')).rejects.toThrow(
      'Failed to fetch tenant settings',
    );
    vi.unstubAllGlobals();
  });
});

describe('fetchTenantSettingsFresh', () => {
  it('fetches GET /tenants/settings uncached and returns tenant settings', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: () => Promise.resolve(tenantSettingsResponse) });
    vi.stubGlobal('fetch', fetchMock);
    process.env.NEXT_PUBLIC_BFF_URL = 'http://bff.test/v1';

    const res = await fetchTenantSettingsFresh('test-token');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://bff.test/v1/tenants/settings',
      expect.objectContaining({
        headers: { Cookie: 'access_token=test-token' },
        cache: 'no-store',
      }),
    );
    expect(res).toEqual(tenantSettingsResponse);
    vi.unstubAllGlobals();
  });

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    await expect(fetchTenantSettingsFresh('bad-token')).rejects.toThrow(
      'Failed to fetch tenant settings',
    );
    vi.unstubAllGlobals();
  });
});

describe('resolveTenantFormatting', () => {
  it('derives formatting config from canonical tenant settings', () => {
    expect(resolveTenantFormatting(tenantSettingsResponse)).toEqual({
      locale: 'pt-BR',
      currency: 'BRL',
      timezone: 'America/Sao_Paulo',
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '24h',
    });
  });
});

describe('resolveWelcomeStaffScreenDays', () => {
  it('returns the configured booking queue window from tenant settings', () => {
    expect(resolveWelcomeStaffScreenDays(tenantSettingsResponse)).toBe(21);
  });
});
