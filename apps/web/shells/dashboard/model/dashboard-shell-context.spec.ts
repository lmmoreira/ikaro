import type { TenantSettingsResponse } from '@ikaro/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeJwtPayload } from '@/features/auth/decode-jwt';
import {
  fetchLeadFormStatus,
  fetchTenantSettings,
} from '@/features/platform/api/tenant-settings.server';
import { resolveTenantFormatting } from '@/features/platform/model/tenant-settings';
import { getMessages, resolveSupportedLocale } from '@/shared/lib/i18n/get-messages';
import { fetchTenantAccess } from '@/shared/lib/billing/access.server';
import {
  buildDashboardShellContext,
  loadDashboardShellContext,
  resolveDashboardDateFormat,
} from './dashboard-shell-context';

const headerValues = vi.hoisted(() => ({ pathname: '/dashboard/bookings' as string | null }));
const redirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { url });
  }),
);

vi.mock('next/headers', () => ({
  headers: async () => ({
    get: (name: string) => (name === 'x-pathname' ? headerValues.pathname : null),
  }),
}));
vi.mock('next/navigation', () => ({ redirect }));
vi.mock('@/shared/lib/billing/access.server', () => ({ fetchTenantAccess: vi.fn() }));

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
    fetchLeadFormStatus: vi.fn(),
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

const ALL_FEATURES = ['HOTSITE', 'BOOKING', 'LOYALTY', 'CHATBOT', 'LEAD_FORM'] as const;

const managerPayload = {
  tenantName: 'Lavacar',
  tenantSlug: 'lavacar',
  tenantId: 'tenant-1',
  userName: 'Ana',
  role: 'MANAGER',
  locale: 'pt-BR',
} as ReturnType<typeof decodeJwtPayload>;

const staffPayload = { ...managerPayload, role: 'STAFF' } as ReturnType<typeof decodeJwtPayload>;

function entitledAccess(features: readonly (typeof ALL_FEATURES)[number][] = ALL_FEATURES) {
  vi.mocked(fetchTenantAccess).mockResolvedValue({
    ok: true,
    access: { operational: true, features },
  });
}

beforeEach(() => {
  headerValues.pathname = '/dashboard/bookings';
  vi.mocked(getMessages).mockResolvedValue({ dashboard: {} } as never);
  vi.mocked(fetchTenantSettings).mockResolvedValue(tenantSettings);
  vi.mocked(fetchLeadFormStatus).mockResolvedValue({ enabled: true });
  entitledAccess();
});

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
  it('loads localized messages, tenant formatting, and lead-form status for the resolved locale', async () => {
    vi.mocked(getMessages).mockResolvedValue({ dashboard: { servicesPage: {} } } as never);
    vi.mocked(fetchTenantSettings).mockResolvedValue(tenantSettings);
    vi.mocked(fetchLeadFormStatus).mockResolvedValue({ enabled: true });

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
    expect(fetchLeadFormStatus).toHaveBeenCalledWith('token-123');
    expect(context).toMatchObject({
      tenantName: 'Lavacar',
      tenantSlug: 'lavacar',
      tenantId: 'tenant-1',
      userName: 'Ana',
      role: 'STAFF',
      locale: 'en',
      messages: { dashboard: { servicesPage: {} } },
      formatting: resolveTenantFormatting(tenantSettings),
      leadFormEnabled: true,
    });
  });

  it('resolves leadFormEnabled to false when the module has never been enabled', async () => {
    vi.mocked(getMessages).mockResolvedValue({ dashboard: { servicesPage: {} } } as never);
    vi.mocked(fetchTenantSettings).mockResolvedValue(tenantSettings);
    vi.mocked(fetchLeadFormStatus).mockResolvedValue({ enabled: false });

    const context = await loadDashboardShellContext('token-123', {
      tenantName: 'Lavacar',
      tenantSlug: 'lavacar',
      tenantId: 'tenant-1',
      userName: 'Ana',
      role: 'STAFF',
      locale: 'en-GB',
    } as ReturnType<typeof decodeJwtPayload>);

    expect(context.leadFormEnabled).toBe(false);
  });
});

describe('loadDashboardShellContext — billing access (M25-S29)', () => {
  it('reads the access answer before the settings and lead-form reads', async () => {
    const order: string[] = [];
    vi.mocked(fetchTenantAccess).mockImplementation(async () => {
      order.push('access');
      return { ok: true, access: { operational: true, features: [...ALL_FEATURES] } };
    });
    vi.mocked(fetchTenantSettings).mockImplementation(async () => {
      order.push('settings');
      return tenantSettings;
    });
    vi.mocked(fetchLeadFormStatus).mockImplementation(async () => {
      order.push('lead-form');
      return { enabled: true };
    });

    await loadDashboardShellContext('token', managerPayload);

    expect(order[0]).toBe('access');
    expect(order).toHaveLength(3);
  });

  it('reads the access answer with the caller own token only, never a tenant id parameter', async () => {
    await loadDashboardShellContext('caller-token', managerPayload);

    expect(fetchTenantAccess).toHaveBeenCalledTimes(1);
    expect(fetchTenantAccess).toHaveBeenCalledWith('caller-token');
  });

  it('locks every feature the tenant does not hold and names the route feature', async () => {
    entitledAccess(['HOTSITE', 'BOOKING']);
    headerValues.pathname = '/dashboard/loyalty';

    const context = await loadDashboardShellContext('token', managerPayload);

    expect(context.lockedFeatures).toEqual(['LOYALTY', 'CHATBOT', 'LEAD_FORM']);
    expect(context.routeFeature).toBe('LOYALTY');
  });

  it('skips the lead-form read and reports it disabled when LEAD_FORM is not entitled', async () => {
    entitledAccess(['HOTSITE', 'BOOKING', 'LOYALTY', 'CHATBOT']);

    const context = await loadDashboardShellContext('token', managerPayload);

    expect(fetchLeadFormStatus).not.toHaveBeenCalled();
    expect(context.leadFormEnabled).toBe(false);
    expect(context.lockedFeatures).toEqual(['LEAD_FORM']);
  });

  it('keeps the manager own lead-form choice when LEAD_FORM is entitled but not enabled', async () => {
    vi.mocked(fetchLeadFormStatus).mockResolvedValue({ enabled: false });

    const context = await loadDashboardShellContext('token', managerPayload);

    expect(fetchLeadFormStatus).toHaveBeenCalledWith('token');
    expect(context.leadFormEnabled).toBe(false);
    expect(context.lockedFeatures).toEqual([]);
  });

  it('redirects a manager of a suspended tenant to the notice before any other read', async () => {
    vi.mocked(fetchTenantAccess).mockResolvedValue({
      ok: true,
      access: { operational: false, features: [] },
    });

    await expect(loadDashboardShellContext('token', managerPayload)).rejects.toMatchObject({
      url: '/dashboard/suspended',
    });

    expect(fetchTenantSettings).not.toHaveBeenCalled();
    expect(fetchLeadFormStatus).not.toHaveBeenCalled();
  });

  it('does not redirect from the notice itself or the login page', async () => {
    vi.mocked(fetchTenantAccess).mockResolvedValue({
      ok: true,
      access: { operational: false, features: [] },
    });

    headerValues.pathname = '/dashboard/suspended';
    await expect(loadDashboardShellContext('token', managerPayload)).resolves.toBeDefined();
    headerValues.pathname = '/dashboard/login';
    await expect(loadDashboardShellContext('token', managerPayload)).resolves.toBeDefined();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('does not redirect a suspended staff member in M25-S29 (S31a extends it)', async () => {
    vi.mocked(fetchTenantAccess).mockResolvedValue({
      ok: true,
      access: { operational: false, features: [] },
    });

    await expect(loadDashboardShellContext('token', staffPayload)).resolves.toBeDefined();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('fails open on a failed access read: nothing locked, no redirect', async () => {
    vi.mocked(fetchTenantAccess).mockResolvedValue({ ok: false });

    const context = await loadDashboardShellContext('token', managerPayload);

    expect(context.lockedFeatures).toEqual([]);
    expect(context.leadFormEnabled).toBe(true);
    expect(redirect).not.toHaveBeenCalled();
  });

  it('gives no route feature when x-pathname is missing', async () => {
    headerValues.pathname = null;

    const context = await loadDashboardShellContext('token', managerPayload);

    expect(context.routeFeature).toBeNull();
  });
});

describe('resolveDashboardDateFormat', () => {
  it('normalizes the tenant date format through the shared resolver', () => {
    expect(resolveDashboardDateFormat(resolveTenantFormatting(tenantSettings))).toBe('DD/MM/YYYY');
  });
});
