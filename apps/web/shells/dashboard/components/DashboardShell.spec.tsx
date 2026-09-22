// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DashboardShell } from './DashboardShell';

vi.mock('./Sidebar', () => ({ Sidebar: () => <aside data-testid="sidebar" /> }));
vi.mock('./Topbar', () => ({ Topbar: () => <header data-testid="topbar" /> }));
vi.mock('./BottomNav', () => ({
  BottomNav: ({ onOpenSheet }: { onOpenSheet: () => void }) => (
    <button data-testid="bottom-nav-more" onClick={onOpenSheet}>
      Mais
    </button>
  ),
}));
vi.mock('./MoreSheet', () => ({
  MoreSheet: ({ open, onClose }: { open: boolean; onClose: () => void }) => (
    <div data-testid="more-sheet" data-open={String(open)}>
      <button onClick={onClose}>Fechar</button>
    </div>
  ),
}));

const DEFAULT_PROPS = {
  tenantName: 'Lavacar BH',
  tenantSlug: 'lavacar-bh',
  userName: 'Ana Pereira',
  leadFormEnabled: false,
} as const;

const STAFF = 'STAFF' as const;
const MANAGER = 'MANAGER' as const;

describe('DashboardShell', () => {
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

  it('renders MoreSheet for MANAGER role even when leadFormEnabled is false', () => {
    render(
      <DashboardShell {...DEFAULT_PROPS} role={MANAGER}>
        children
      </DashboardShell>,
    );

    expect(screen.getByTestId('more-sheet')).toBeInTheDocument();
  });

  it('does not render MoreSheet for STAFF role when leadFormEnabled is false', () => {
    render(
      <DashboardShell {...DEFAULT_PROPS} role={STAFF}>
        children
      </DashboardShell>,
    );

    expect(screen.queryByTestId('more-sheet')).not.toBeInTheDocument();
  });

  it('renders MoreSheet for STAFF role when leadFormEnabled is true', () => {
    render(
      <DashboardShell {...DEFAULT_PROPS} role={STAFF} leadFormEnabled>
        children
      </DashboardShell>,
    );

    expect(screen.getByTestId('more-sheet')).toBeInTheDocument();
  });

  it('opens the MoreSheet when BottomNav triggers onOpenSheet', async () => {
    render(
      <DashboardShell {...DEFAULT_PROPS} role={MANAGER}>
        children
      </DashboardShell>,
    );

    expect(screen.getByTestId('more-sheet')).toHaveAttribute('data-open', 'false');

    await userEvent.click(screen.getByTestId('bottom-nav-more'));

    expect(screen.getByTestId('more-sheet')).toHaveAttribute('data-open', 'true');
  });

  it('closes the MoreSheet when onClose is called', async () => {
    render(
      <DashboardShell {...DEFAULT_PROPS} role={MANAGER}>
        children
      </DashboardShell>,
    );

    await userEvent.click(screen.getByTestId('bottom-nav-more'));
    expect(screen.getByTestId('more-sheet')).toHaveAttribute('data-open', 'true');

    await userEvent.click(screen.getByText('Fechar'));
    expect(screen.getByTestId('more-sheet')).toHaveAttribute('data-open', 'false');
  });
});
