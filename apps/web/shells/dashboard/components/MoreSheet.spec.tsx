// @vitest-environment jsdom
import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { clearPublicEnv, stubPublicEnv } from '@/test-utils';
import { resolveDashboardNav } from '@/shells/dashboard/model/dashboard-nav';
import { MoreSheet as MoreSheetView } from './MoreSheet';

// The shell resolves the navigation once and hands it to the sheet; these cases state the facts
// (role, the lead-form switch, the locked features) and let the registry resolve them, as the shell
// does.
type MoreSheetProps = Omit<ComponentProps<typeof MoreSheetView>, 'nav'> & {
  readonly leadFormEnabled: boolean;
};

function MoreSheet({ leadFormEnabled, ...props }: MoreSheetProps): React.JSX.Element {
  const nav = resolveDashboardNav({
    role: props.role,
    lockedFeatures: props.lockedFeatures,
    toggles: { leadForm: leadFormEnabled },
  });
  return <MoreSheetView {...props} nav={nav} />;
}

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      'nav.leads': 'Leads',
      'nav.schedulingExceptions': 'Reservas a resolver',
      'nav.resources': 'Recursos',
      'nav.team': 'Equipe',
      'nav.settings': 'Configurações',
      'nav.hotsite': 'Hotsite',
      'nav.managerOnly': 'Somente Gerente',
      'sidebar.signOut': 'Sair',
    };
    return map[key] ?? key;
  },
}));

vi.mock('@/features/booking/hooks/useSchedulingExceptions', () => ({
  useOpenSchedulingExceptionsCount: () => ({ data: 2 }),
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
        lockedFeatures={[]}
      />,
    );

    expect(screen.getByText('Recursos')).toBeInTheDocument();
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
        lockedFeatures={[]}
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
        lockedFeatures={[]}
      />,
    );

    expect(screen.getByText('Leads')).toBeInTheDocument();
    expect(screen.queryByText('Recursos')).not.toBeInTheDocument();
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
        lockedFeatures={[]}
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
        lockedFeatures={[]}
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
        lockedFeatures={[]}
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
        lockedFeatures={[]}
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
        lockedFeatures={[]}
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
        lockedFeatures={[]}
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
        lockedFeatures={[]}
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
        lockedFeatures={[]}
      />,
    );

    const panel = screen.getByTestId('more-sheet-panel');
    expect(panel).not.toHaveAttribute('inert');
  });

  it('lists "Reservas a resolver" first in the manager section, with the open count', () => {
    render(
      <MoreSheet
        open={true}
        onClose={vi.fn()}
        tenantSlug="lavacar-bh"
        role={MANAGER}
        leadFormEnabled={false}
        lockedFeatures={[]}
      />,
    );

    const items = screen.getAllByRole('link').map((a) => a.textContent);
    expect(items[0]).toContain('Reservas a resolver');
    expect(screen.getByTestId('more-sheet-scheduling-exceptions')).toHaveAttribute(
      'href',
      '/dashboard/scheduling-exceptions',
    );
    expect(screen.getByTestId('scheduling-exceptions-badge')).toHaveTextContent('2');
  });

  it('does not list "Reservas a resolver" for a STAFF user with the lead form on', () => {
    render(
      <MoreSheet
        open={true}
        onClose={vi.fn()}
        tenantSlug="lavacar-bh"
        role={STAFF}
        leadFormEnabled={true}
        lockedFeatures={[]}
      />,
    );

    expect(screen.queryByText('Reservas a resolver')).not.toBeInTheDocument();
  });

  it('closes the sheet when the item is chosen', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <MoreSheet
        open={true}
        onClose={onClose}
        tenantSlug="lavacar-bh"
        role={MANAGER}
        leadFormEnabled={false}
        lockedFeatures={[]}
      />,
    );

    await user.click(screen.getByTestId('more-sheet-scheduling-exceptions'));

    expect(onClose).toHaveBeenCalled();
  });
});

describe('MoreSheet — locked items (UC-125)', () => {
  it('shows Leads locked for STAFF when the tenant is not entitled, keeping its href', () => {
    render(
      <MoreSheet
        open={true}
        onClose={vi.fn()}
        tenantSlug="lavacar-bh"
        role={STAFF}
        leadFormEnabled={false}
        lockedFeatures={['LEAD_FORM']}
      />,
    );

    const leads = screen.getByRole('link', { name: /Leads/ });
    expect(leads).toHaveAttribute('href', '/dashboard/leads');
    expect(leads).toHaveAttribute('data-locked', 'true');
  });

  it('shows Leads normally when entitled and enabled', () => {
    render(
      <MoreSheet
        open={true}
        onClose={vi.fn()}
        tenantSlug="lavacar-bh"
        role={STAFF}
        leadFormEnabled={true}
        lockedFeatures={[]}
      />,
    );

    expect(screen.getByRole('link', { name: 'Leads' })).not.toHaveAttribute('data-locked');
    expect(screen.queryByTestId('nav-lock')).not.toBeInTheDocument();
  });

  it('locks the manager items by their feature, with the padlock', () => {
    render(
      <MoreSheet
        open={true}
        onClose={vi.fn()}
        tenantSlug="lavacar-bh"
        role={MANAGER}
        leadFormEnabled={false}
        lockedFeatures={['BOOKING']}
      />,
    );

    expect(screen.getByRole('link', { name: /Recursos/ })).toHaveAttribute('data-locked', 'true');
    expect(screen.getByTestId('more-sheet-scheduling-exceptions')).toHaveAttribute(
      'data-locked',
      'true',
    );
    expect(screen.getByRole('link', { name: /Equipe/ })).not.toHaveAttribute('data-locked');
  });
});
