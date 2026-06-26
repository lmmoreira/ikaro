// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DashboardShell } from './DashboardShell';

const { mockConfigureBffClient } = vi.hoisted(() => ({
  mockConfigureBffClient: vi.fn(),
}));
vi.mock('@/lib/api/bff-client', () => ({ configureBffClient: mockConfigureBffClient }));

vi.mock('./Sidebar', () => ({ Sidebar: () => <aside data-testid="sidebar" /> }));
vi.mock('./Topbar', () => ({ Topbar: () => <header data-testid="topbar" /> }));
vi.mock('./BottomNav', () => ({
  BottomNav: ({ onOpenSheet }: { onOpenSheet: () => void }) => (
    <button data-testid="bottom-nav-more" onClick={onOpenSheet}>
      Mais
    </button>
  ),
}));
vi.mock('./ManagerSheet', () => ({
  ManagerSheet: ({ open, onClose }: { open: boolean; onClose: () => void }) => (
    <div data-testid="manager-sheet" data-open={String(open)}>
      <button onClick={onClose}>Fechar</button>
    </div>
  ),
}));

const DEFAULT_PROPS = {
  tenantName: 'Lavacar BH',
  tenantSlug: 'lavacar-bh',
  tenantId: '10000000-0000-4000-8000-000000000001',
  userName: 'Ana Pereira',
} as const;

const STAFF = 'STAFF' as const;
const MANAGER = 'MANAGER' as const;

describe('DashboardShell', () => {
  it('calls configureBffClient with tenantSlug and tenantId on mount', () => {
    render(
      <DashboardShell {...DEFAULT_PROPS} role={STAFF}>
        children
      </DashboardShell>,
    );

    expect(mockConfigureBffClient).toHaveBeenCalledWith({
      token: '',
      tenantSlug: 'lavacar-bh',
      tenantId: '10000000-0000-4000-8000-000000000001',
    });
  });

  it('renders provided children inside the main area', () => {
    render(
      <DashboardShell {...DEFAULT_PROPS} role={STAFF}>
        <p>Conteúdo da página</p>
      </DashboardShell>,
    );

    expect(screen.getByText('Conteúdo da página')).toBeInTheDocument();
  });

  it('renders Sidebar and Topbar', () => {
    render(
      <DashboardShell {...DEFAULT_PROPS} role={STAFF}>
        children
      </DashboardShell>,
    );

    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('topbar')).toBeInTheDocument();
  });

  it('renders ManagerSheet for MANAGER role', () => {
    render(
      <DashboardShell {...DEFAULT_PROPS} role={MANAGER}>
        children
      </DashboardShell>,
    );

    expect(screen.getByTestId('manager-sheet')).toBeInTheDocument();
  });

  it('does not render ManagerSheet for STAFF role', () => {
    render(
      <DashboardShell {...DEFAULT_PROPS} role={STAFF}>
        children
      </DashboardShell>,
    );

    expect(screen.queryByTestId('manager-sheet')).not.toBeInTheDocument();
  });

  it('opens the ManagerSheet when BottomNav triggers onOpenSheet', async () => {
    render(
      <DashboardShell {...DEFAULT_PROPS} role={MANAGER}>
        children
      </DashboardShell>,
    );

    expect(screen.getByTestId('manager-sheet')).toHaveAttribute('data-open', 'false');

    await userEvent.click(screen.getByTestId('bottom-nav-more'));

    expect(screen.getByTestId('manager-sheet')).toHaveAttribute('data-open', 'true');
  });

  it('closes the ManagerSheet when onClose is called', async () => {
    render(
      <DashboardShell {...DEFAULT_PROPS} role={MANAGER}>
        children
      </DashboardShell>,
    );

    await userEvent.click(screen.getByTestId('bottom-nav-more'));
    expect(screen.getByTestId('manager-sheet')).toHaveAttribute('data-open', 'true');

    await userEvent.click(screen.getByText('Fechar'));
    expect(screen.getByTestId('manager-sheet')).toHaveAttribute('data-open', 'false');
  });
});
