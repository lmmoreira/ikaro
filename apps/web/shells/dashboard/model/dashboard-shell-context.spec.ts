import type { TenantSettingsResponse } from '@ikaro/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeJwtPayload } from '@/features/auth/decode-jwt';
import { fetchTenantSettings } from '@/features/platform/api/tenant-settings.server';
import { resolveTenantFormatting } from '@/features/platform/model/tenant-settings';
import { getMessages, resolveSupportedLocale } from '@/shared/lib/i18n/get-messages';
import {
  buildDashboardShellContext,
  loadDashboardShellContext,
  resolveDashboardDateFormat,
} from './dashboard-shell-context';

vi.mock('@/shared/lib/i18n/get-messages', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/i18n/get-messages')>();
  return {
    ...actual,
    getMessages: vi.fn(),
  };
});

vi.mock('@/features/platform/api/tenant-settings.server', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/features/platform/api/tenant-settings.server')>();
  return {
    ...actual,
    fetchTenantSettings: vi.fn(),
  };
});

const tenantSettings = {
  tenantId: 'tenant-1',
  name: 'Lavacar',
  slug: 'lavacar',
  settings: {
    localization: {
      countryCode: 'BR',
      currency: 'BRL',
      language: 'pt-BR',
    },
    businessHours: {
      timezone: 'America/Sao_Paulo',
    },
  },
} as TenantSettingsResponse;

afterEach(() => {
  vi.clearAllMocks();
});

describe('buildDashboardShellContext', () => {
  it('fills the dashboard shell data from the decoded JWT payload', () => {
    const payload = {
      tenantName: 'Lavacar',
      tenantSlug: 'lavacar',
      tenantId: 'tenant-1',
      userName: 'Ana',
      role: 'MANAGER',
      locale: 'en-US',
    };

    expect(buildDashboardShellContext(payload as ReturnType<typeof decodeJwtPayload>)).toEqual({
      tenantName: 'Lavacar',
      tenantSlug: 'lavacar',
      tenantId: 'tenant-1',
      userName: 'Ana',
      role: 'MANAGER',
      locale: resolveSupportedLocale('en-US'),
    });
  });

  it('falls back to safe defaults when claims are missing', () => {
    expect(buildDashboardShellContext({} as ReturnType<typeof decodeJwtPayload>)).toEqual({
      tenantName: '',
      tenantSlug: '',
      tenantId: '',
      userName: null,
      role: 'STAFF',
      locale: 'pt-BR',
    });
  });
});

describe('loadDashboardShellContext', () => {
  it('loads localized messages and tenant formatting for the resolved locale', async () => {
    vi.mocked(getMessages).mockResolvedValue({ dashboard: { servicesPage: {} } } as never);
    vi.mocked(fetchTenantSettings).mockResolvedValue(tenantSettings);

    const context = await loadDashboardShellContext('token-123', {
      tenantName: 'Lavacar',
      tenantSlug: 'lavacar',
      tenantId: 'tenant-1',
      userName: 'Ana',
      role: 'STAFF',
      locale: 'en-GB',
    } as ReturnType<typeof decodeJwtPayload>);

    expect(getMessages).toHaveBeenCalledWith('en');
    expect(fetchTenantSettings).toHaveBeenCalledWith('token-123');
    expect(context).toMatchObject({
      tenantName: 'Lavacar',
      tenantSlug: 'lavacar',
      tenantId: 'tenant-1',
      userName: 'Ana',
      role: 'STAFF',
      locale: 'en',
      messages: { dashboard: { servicesPage: {} } },
      formatting: resolveTenantFormatting(tenantSettings),
    });
  });
});

describe('resolveDashboardDateFormat', () => {
  it('normalizes the tenant date format through the shared resolver', () => {
    expect(resolveDashboardDateFormat(resolveTenantFormatting(tenantSettings))).toBe('DD/MM/YYYY');
  });
});
