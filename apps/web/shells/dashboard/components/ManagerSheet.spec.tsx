// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { clearPublicEnv, stubPublicEnv } from '@/test-utils';
import { ManagerSheet } from './ManagerSheet';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      'nav.team': 'Equipe',
      'nav.settings': 'Configurações',
      'nav.hotsite': 'Hotsite',
      'nav.managerOnly': 'Somente Gerente',
      'sidebar.signOut': 'Sair',
    };
    return map[key] ?? key;
  },
}));

describe('ManagerSheet', () => {
  it('renders nav items when open', () => {
    render(<ManagerSheet open={true} onClose={vi.fn()} tenantSlug="lavacar-bh" />);

    expect(screen.getByText('Equipe')).toBeInTheDocument();
    expect(screen.getByText('Configurações')).toBeInTheDocument();
    expect(screen.getByText('Hotsite')).toBeInTheDocument();
  });

  it('renders logout link pointing to the BFF logout route', () => {
    stubPublicEnv({ NEXT_PUBLIC_BFF_URL: 'http://bff:3002/v1' });
    render(<ManagerSheet open={true} onClose={vi.fn()} tenantSlug="lavacar-bh" />);

    const logoutLink = screen.getByText('Sair').closest('a');
    expect(logoutLink).toHaveAttribute(
      'href',
      'http://bff:3002/v1/auth/logout?tenantSlug=lavacar-bh',
    );

    clearPublicEnv();
  });

  it('calls onClose when the backdrop is clicked', async () => {
    const onClose = vi.fn();
    render(<ManagerSheet open={true} onClose={onClose} tenantSlug="lavacar-bh" />);

    const backdrop = document.querySelector('[aria-hidden="true"]') as HTMLElement;
    await userEvent.click(backdrop);

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when a nav item is clicked', async () => {
    const onClose = vi.fn();
    render(<ManagerSheet open={true} onClose={onClose} tenantSlug="lavacar-bh" />);

    await userEvent.click(screen.getByText('Equipe'));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('applies pointer-events-none when closed', () => {
    render(<ManagerSheet open={false} onClose={vi.fn()} tenantSlug="lavacar-bh" />);

    const panel = document.querySelector('.pointer-events-none');
    expect(panel).toBeInTheDocument();
  });

  it('marks the panel inert when closed to keep it out of tab order', () => {
    render(<ManagerSheet open={false} onClose={vi.fn()} tenantSlug="lavacar-bh" />);

    const panel = screen.getByTestId('manager-sheet-panel');
    expect(panel).toHaveAttribute('inert');
  });

  it('removes inert from the panel when open', () => {
    render(<ManagerSheet open={true} onClose={vi.fn()} tenantSlug="lavacar-bh" />);

    const panel = screen.getByTestId('manager-sheet-panel');
    expect(panel).not.toHaveAttribute('inert');
  });
});
