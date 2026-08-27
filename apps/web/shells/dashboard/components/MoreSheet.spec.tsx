// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { clearPublicEnv, stubPublicEnv } from '@/test-utils';
import { MoreSheet } from './MoreSheet';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      'nav.leads': 'Leads',
      'nav.team': 'Equipe',
      'nav.settings': 'Configurações',
      'nav.hotsite': 'Hotsite',
      'nav.managerOnly': 'Somente Gerente',
      'sidebar.signOut': 'Sair',
    };
    return map[key] ?? key;
  },
}));

const STAFF = 'STAFF' as const;
const MANAGER = 'MANAGER' as const;

describe('MoreSheet', () => {
  it('renders the manager-only nav items for MANAGER when leadFormEnabled is false', () => {
    render(
      <MoreSheet
        open={true}
        onClose={vi.fn()}
        tenantSlug="lavacar-bh"
        role={MANAGER}
        leadFormEnabled={false}
      />,
    );

    expect(screen.getByText('Equipe')).toBeInTheDocument();
    expect(screen.getByText('Configurações')).toBeInTheDocument();
    expect(screen.getByText('Hotsite')).toBeInTheDocument();
    expect(screen.queryByText('Leads')).not.toBeInTheDocument();
  });

  it('renders a header-less "Leads" item plus the manager-only section for MANAGER when leadFormEnabled is true', () => {
    render(
      <MoreSheet
        open={true}
        onClose={vi.fn()}
        tenantSlug="lavacar-bh"
        role={MANAGER}
        leadFormEnabled={true}
      />,
    );

    expect(screen.getByText('Leads')).toBeInTheDocument();
    expect(screen.getByText('Equipe')).toBeInTheDocument();
    expect(screen.getByText('Somente Gerente')).toBeInTheDocument();
  });

  it('renders only "Leads" for STAFF when leadFormEnabled is true — no manager-only section', () => {
    render(
      <MoreSheet
        open={true}
        onClose={vi.fn()}
        tenantSlug="lavacar-bh"
        role={STAFF}
        leadFormEnabled={true}
      />,
    );

    expect(screen.getByText('Leads')).toBeInTheDocument();
    expect(screen.queryByText('Equipe')).not.toBeInTheDocument();
    expect(screen.queryByText('Configurações')).not.toBeInTheDocument();
    expect(screen.queryByText('Hotsite')).not.toBeInTheDocument();
    expect(screen.queryByText('Somente Gerente')).not.toBeInTheDocument();
  });

  it('renders nothing but the logout link for STAFF when leadFormEnabled is false', () => {
    render(
      <MoreSheet
        open={true}
        onClose={vi.fn()}
        tenantSlug="lavacar-bh"
        role={STAFF}
        leadFormEnabled={false}
      />,
    );

    expect(screen.queryByText('Leads')).not.toBeInTheDocument();
    expect(screen.queryByText('Somente Gerente')).not.toBeInTheDocument();
    expect(screen.getByText('Sair')).toBeInTheDocument();
  });

  it('renders logout link pointing to the BFF logout route', () => {
    stubPublicEnv({ NEXT_PUBLIC_BFF_URL: 'http://bff:3002/v1' });
    render(
      <MoreSheet
        open={true}
        onClose={vi.fn()}
        tenantSlug="lavacar-bh"
        role={MANAGER}
        leadFormEnabled={false}
      />,
    );

    const logoutLink = screen.getByText('Sair').closest('a');
    expect(logoutLink).toHaveAttribute(
      'href',
      'http://bff:3002/v1/auth/logout?tenantSlug=lavacar-bh',
    );

    clearPublicEnv();
  });

  it('calls onClose when the backdrop is clicked', async () => {
    const onClose = vi.fn();
    render(
      <MoreSheet
        open={true}
        onClose={onClose}
        tenantSlug="lavacar-bh"
        role={MANAGER}
        leadFormEnabled={false}
      />,
    );

    const backdrop = document.querySelector('[aria-hidden="true"]') as HTMLElement;
    await userEvent.click(backdrop);

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when a nav item is clicked', async () => {
    const onClose = vi.fn();
    render(
      <MoreSheet
        open={true}
        onClose={onClose}
        tenantSlug="lavacar-bh"
        role={MANAGER}
        leadFormEnabled={false}
      />,
    );

    await userEvent.click(screen.getByText('Equipe'));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when the "Leads" item is clicked', async () => {
    const onClose = vi.fn();
    render(
      <MoreSheet
        open={true}
        onClose={onClose}
        tenantSlug="lavacar-bh"
        role={STAFF}
        leadFormEnabled={true}
      />,
    );

    await userEvent.click(screen.getByText('Leads'));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('applies pointer-events-none when closed', () => {
    render(
      <MoreSheet
        open={false}
        onClose={vi.fn()}
        tenantSlug="lavacar-bh"
        role={MANAGER}
        leadFormEnabled={false}
      />,
    );

    const panel = document.querySelector('.pointer-events-none');
    expect(panel).toBeInTheDocument();
  });

  it('marks the panel inert when closed to keep it out of tab order', () => {
    render(
      <MoreSheet
        open={false}
        onClose={vi.fn()}
        tenantSlug="lavacar-bh"
        role={MANAGER}
        leadFormEnabled={false}
      />,
    );

    const panel = screen.getByTestId('more-sheet-panel');
    expect(panel).toHaveAttribute('inert');
  });

  it('removes inert from the panel when open', () => {
    render(
      <MoreSheet
        open={true}
        onClose={vi.fn()}
        tenantSlug="lavacar-bh"
        role={MANAGER}
        leadFormEnabled={false}
      />,
    );

    const panel = screen.getByTestId('more-sheet-panel');
    expect(panel).not.toHaveAttribute('inert');
  });
});
