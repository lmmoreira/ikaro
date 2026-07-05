// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DashboardShellContext } from '../model/dashboard-shell-context';
import { DashboardSectionShell } from './DashboardSectionShell';

vi.mock('./DashboardShell', () => ({
  DashboardShell: ({
    tenantName,
    role,
    children,
  }: {
    tenantName: string;
    role: string;
    children: React.ReactNode;
  }) => (
    <div data-testid="dashboard-shell" data-tenant-name={tenantName} data-role={role}>
      {children}
    </div>
  ),
}));

function buildShell(overrides?: Partial<DashboardShellContext>): DashboardShellContext {
  return {
    tenantName: 'BeloAuto Demo',
    tenantSlug: 'beloauto',
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
    ...overrides,
  };
}

describe('DashboardSectionShell', () => {
  it('renders children inside the DashboardShell', () => {
    render(
      <DashboardSectionShell shell={buildShell()}>
        <p>Conteúdo da seção</p>
      </DashboardSectionShell>,
    );

    expect(screen.getByTestId('dashboard-shell')).toBeInTheDocument();
    expect(screen.getByText('Conteúdo da seção')).toBeInTheDocument();
  });

  it('forwards tenant name and role from the shell context', () => {
    render(
      <DashboardSectionShell shell={buildShell({ tenantName: 'Lavacar BH', role: 'STAFF' })}>
        <p>Conteúdo</p>
      </DashboardSectionShell>,
    );

    const shell = screen.getByTestId('dashboard-shell');
    expect(shell).toHaveAttribute('data-tenant-name', 'Lavacar BH');
    expect(shell).toHaveAttribute('data-role', 'STAFF');
  });
});
