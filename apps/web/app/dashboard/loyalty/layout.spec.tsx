// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import LoyaltyLayout from './layout';

const getAccessToken = vi.hoisted(() => vi.fn());
const decodeJwtPayload = vi.hoisted(() => vi.fn());
const headers = vi.hoisted(() => vi.fn());
const loadDashboardShellContext = vi.hoisted(() => vi.fn());
const resolveDashboardDateFormat = vi.hoisted(() => vi.fn(() => 'dd/MM/yyyy'));

const LocaleProvider = vi.hoisted(() =>
  vi.fn(({ children }) => <div data-testid="locale-provider">{children}</div>),
);
const FormattingProvider = vi.hoisted(() =>
  vi.fn(({ children }) => <div data-testid="formatting-provider">{children}</div>),
);
const TenantProvider = vi.hoisted(() =>
  vi.fn(({ children }) => <div data-testid="tenant-provider">{children}</div>),
);
const DashboardShell = vi.hoisted(() =>
  vi.fn(({ children }) => <div data-testid="dashboard-shell">{children}</div>),
);
const DashboardTopbarStatusProvider = vi.hoisted(() =>
  vi.fn(({ children }) => <div data-testid="topbar-provider">{children}</div>),
);

vi.mock('next/headers', () => ({
  headers,
}));

vi.mock('@/features/auth/get-access-token', () => ({
  getAccessToken,
}));

vi.mock('@/features/auth/decode-jwt', () => ({
  decodeJwtPayload,
}));

vi.mock('@/providers/locale-provider', () => ({
  LocaleProvider,
}));

vi.mock('@/providers/formatting-provider', () => ({
  FormattingProvider,
}));

vi.mock('@/providers/tenant-provider', () => ({
  TenantProvider,
}));

vi.mock('@/shells/dashboard/components/DashboardShell', () => ({
  DashboardShell,
}));

vi.mock('@/shells/dashboard/components/topbar-status-context', () => ({
  DashboardTopbarStatusProvider,
}));

vi.mock('@/shells/dashboard/model/dashboard-shell-context', () => ({
  loadDashboardShellContext,
  resolveDashboardDateFormat,
}));

describe('LoyaltyLayout', () => {
  it('wraps the loyalty section with the dashboard providers', async () => {
    vi.mocked(getAccessToken).mockResolvedValue('token-123');
    vi.mocked(decodeJwtPayload).mockReturnValue({ locale: 'pt-BR' });
    vi.mocked(headers).mockResolvedValue(new Headers({ 'x-pathname': '/dashboard/loyalty' }));
    vi.mocked(loadDashboardShellContext).mockResolvedValue({
      locale: 'pt-BR',
      messages: { dashboard: {} },
      formatting: {
        locale: 'pt-BR',
        currency: 'BRL',
        timezone: 'America/Sao_Paulo',
        timeFormat: '24h',
      },
      tenantId: 'tenant-1',
      tenantSlug: 'tenant-slug',
      tenantName: 'Tenant',
      userName: 'User',
      role: 'STAFF',
    });

    const element = await LoyaltyLayout({
      children: <div data-testid="loyalty-child" />,
    });

    render(element);

    expect(getAccessToken).toHaveBeenCalledOnce();
    expect(decodeJwtPayload).toHaveBeenCalledWith('token-123');
    expect(headers).toHaveBeenCalledOnce();
    expect(loadDashboardShellContext).toHaveBeenCalledWith('token-123', { locale: 'pt-BR' });
    expect(resolveDashboardDateFormat).toHaveBeenCalledWith({
      locale: 'pt-BR',
      currency: 'BRL',
      timezone: 'America/Sao_Paulo',
      timeFormat: '24h',
    });
    expect(screen.getByTestId('loyalty-child')).toBeInTheDocument();
  });
});
