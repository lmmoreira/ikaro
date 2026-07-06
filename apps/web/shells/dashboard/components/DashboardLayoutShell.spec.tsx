// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DashboardShellContext } from '@/shells/dashboard/model/dashboard-shell-context';
import { useDashboardTopbarStatus } from './topbar-status-context';
import { DashboardLayoutShell } from './DashboardLayoutShell';

vi.mock('./DashboardShell', () => ({
  DashboardShell: ({
    tenantName,
    userName,
    role: dashboardRole,
    topbarAction,
    children,
  }: {
    tenantName: string;
    userName: string | null;
    role: string;
    topbarAction: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <div
      data-testid="dashboard-shell"
      data-tenant-name={tenantName}
      data-user-name={userName ?? ''}
      data-role={dashboardRole}
    >
      <div data-testid="topbar-action-slot">{topbarAction}</div>
      {children}
    </div>
  ),
}));

function StaffRoleStatusProbe() {
  const status = useDashboardTopbarStatus();
  return <span data-testid="staff-role-status">{status?.staffRoleStatus ?? 'null'}</span>;
}

const SHELL: DashboardShellContext = {
  tenantName: 'Lavacar BH',
  tenantSlug: 'lavacar-bh',
  tenantId: 'tenant-1',
  userName: 'Ana Pereira',
  role: 'MANAGER',
  locale: 'pt-BR',
  messages: {},
  formatting: {
    locale: 'pt-BR',
    currency: 'BRL',
    currencySymbol: 'R$',
    timezone: 'America/Sao_Paulo',
    dateFormat: 'DD/MM/YYYY',
    timeFormat: '24h',
  },
};

describe('DashboardLayoutShell', () => {
  it('renders children inside the dashboard shell', () => {
    render(
      <DashboardLayoutShell shell={SHELL}>
        <p>Conteúdo da página</p>
      </DashboardLayoutShell>,
    );

    expect(screen.getByText('Conteúdo da página')).toBeInTheDocument();
  });

  it('forwards tenant/user/role fields from shell to DashboardShell', () => {
    render(
      <DashboardLayoutShell shell={SHELL}>
        <p>children</p>
      </DashboardLayoutShell>,
    );

    const dashboardShell = screen.getByTestId('dashboard-shell');
    expect(dashboardShell).toHaveAttribute('data-tenant-name', 'Lavacar BH');
    expect(dashboardShell).toHaveAttribute('data-user-name', 'Ana Pereira');
    expect(dashboardShell).toHaveAttribute('data-role', 'MANAGER');
  });

  it('forwards topbarAction into the topbar action slot', () => {
    render(
      <DashboardLayoutShell shell={SHELL} topbarAction={<button>+ Convidar membro</button>}>
        <p>children</p>
      </DashboardLayoutShell>,
    );

    expect(screen.getByTestId('topbar-action-slot')).toHaveTextContent('+ Convidar membro');
  });

  it('seeds the topbar status provider from topbarStatusProps', () => {
    render(
      <DashboardLayoutShell shell={SHELL} topbarStatusProps={{ initialStaffRoleStatus: 'STAFF' }}>
        <StaffRoleStatusProbe />
      </DashboardLayoutShell>,
    );

    expect(screen.getByTestId('staff-role-status')).toHaveTextContent('STAFF');
  });
});
