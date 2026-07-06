// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Topbar } from './Topbar';
import { DashboardTopbarStatusProvider, useDashboardTopbarStatus } from './topbar-status-context';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      back: 'Voltar',
      'nav.bookings': 'Agenda',
      'nav.schedule': 'Horários',
      'nav.services': 'Serviços',
      'nav.loyalty': 'Fidelidade',
      'nav.team': 'Equipe',
      'nav.settings': 'Configurações',
      'nav.hotsite': 'Hotsite',
      createPageTitle: 'Criar serviço',
      editPageTitle: 'Editar serviço',
      deactivatePageTitle: 'Desativar serviço',
      statusActive: 'Ativo',
      statusInactive: 'Inativo',
      invite: 'Convidar membro',
      roleManager: 'Gerente',
      roleStaff: 'Equipe',
      title: 'Detalhe do agendamento',
      completeSheetTitle: 'Marcar concluído',
      rescheduleSheetTitle: 'Reagendar',
      statusPending: 'Pendente',
      statusInfoRequested: 'Aguardando info',
      statusApproved: 'Aprovado',
      'topbar.todayPrefix': 'Hoje,',
      'topbar.defaultTitle': 'Dashboard',
    };
    return map[key] ?? key;
  },
  useLocale: () => 'pt-BR',
}));

vi.mock('@/shells/dashboard/utils/format-today', () => ({
  formatTodayLabel: (_locale: string, prefix: string) => `${prefix} 26 de junho de 2026`,
}));

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
}));

import { usePathname } from 'next/navigation';

function TopbarStatusProbe(): React.JSX.Element {
  const { setBookingStatus, setServiceStatus } = useDashboardTopbarStatus()!;
  return (
    <div>
      <button type="button" onClick={() => setBookingStatus('APPROVED')}>
        Marcar aprovado
      </button>
      <button type="button" onClick={() => setServiceStatus('ACTIVE')}>
        Ativar serviço
      </button>
    </div>
  );
}

function TopbarSetter({
  href,
  backLabel,
  pageTitle,
}: {
  readonly href: string;
  readonly backLabel: string;
  readonly pageTitle: string;
}): React.JSX.Element {
  const { setBackHrefOverride, setBackLabelOverride, setPageTitleOverride } =
    useDashboardTopbarStatus()!;

  useEffect(() => {
    setBackHrefOverride(href);
    setBackLabelOverride(backLabel);
    setPageTitleOverride(pageTitle);
    return () => {
      setBackHrefOverride(null);
      setBackLabelOverride(null);
      setPageTitleOverride(null);
    };
  }, [backLabel, href, pageTitle, setBackHrefOverride, setBackLabelOverride, setPageTitleOverride]);

  return <></>;
}

beforeEach(() => {
  vi.mocked(usePathname).mockReturnValue('/dashboard/bookings');
});

describe('Topbar', () => {
  it('renders the tenant name on mobile', () => {
    render(<Topbar tenantName="Lavacar BH" userName="Ana Pereira" />);

    expect(screen.getByText('Lavacar BH')).toBeInTheDocument();
  });

  it('renders user initials in the mobile avatar', () => {
    render(<Topbar tenantName="Lavacar BH" userName="Ana Pereira" />);

    expect(screen.getByText('AP')).toBeInTheDocument();
  });

  it('shows "?" as initials when userName is null', () => {
    render(<Topbar tenantName="Lavacar BH" userName={null} />);

    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('renders the page title matching the current pathname', () => {
    vi.mocked(usePathname).mockReturnValue('/dashboard/bookings');
    render(<Topbar tenantName="Lavacar BH" userName="Ana" />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Agenda');
  });

  it('renders the create title on the service creation route', () => {
    vi.mocked(usePathname).mockReturnValue('/dashboard/services/new');
    render(
      <DashboardTopbarStatusProvider initialServiceStatus="ACTIVE">
        <Topbar tenantName="Lavacar BH" userName="Ana" />
      </DashboardTopbarStatusProvider>,
    );

    expect(screen.getByRole('link', { name: 'Voltar' })).toHaveAttribute(
      'href',
      '/dashboard/services',
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Criar serviço');
    expect(screen.getByText('Ativo')).toBeInTheDocument();
  });

  it('renders the edit title on the service edit route', () => {
    vi.mocked(usePathname).mockReturnValue('/dashboard/services/svc-1/edit');
    render(<Topbar tenantName="Lavacar BH" userName="Ana" />);

    expect(screen.getByRole('link', { name: 'Serviços' })).toHaveAttribute(
      'href',
      '/dashboard/services',
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Editar serviço');
  });

  it('renders the deactivate title on the service deactivate route', () => {
    vi.mocked(usePathname).mockReturnValue('/dashboard/services/svc-1/deactivate');
    render(
      <DashboardTopbarStatusProvider initialServiceStatus="INACTIVE">
        <Topbar tenantName="Lavacar BH" userName="Ana" />
      </DashboardTopbarStatusProvider>,
    );

    expect(screen.getByRole('link', { name: 'Editar serviço' })).toHaveAttribute(
      'href',
      '/dashboard/services/svc-1/edit',
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Desativar serviço');
    expect(screen.getByText('Inativo')).toBeInTheDocument();
  });

  it('renders the invite title and back link to the team list on the team invite route', () => {
    vi.mocked(usePathname).mockReturnValue('/dashboard/team/invite');
    render(<Topbar tenantName="Lavacar BH" userName="Ana" />);

    expect(screen.getByRole('link', { name: 'Equipe' })).toHaveAttribute('href', '/dashboard/team');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Convidar membro');
  });

  it('renders the staff role badge on the team invite route and keeps it in sync', async () => {
    vi.mocked(usePathname).mockReturnValue('/dashboard/team/invite');

    function StaffRoleProbe(): React.JSX.Element {
      const { setStaffRoleStatus } = useDashboardTopbarStatus()!;
      return (
        <button type="button" onClick={() => setStaffRoleStatus('MANAGER')}>
          Selecionar Gerente
        </button>
      );
    }

    render(
      <DashboardTopbarStatusProvider initialStaffRoleStatus="STAFF">
        <Topbar tenantName="Lavacar BH" userName="Ana" />
        <StaffRoleProbe />
      </DashboardTopbarStatusProvider>,
    );

    expect(screen.getByTestId('team-role-badge')).toHaveTextContent('Equipe');

    await userEvent.click(screen.getByRole('button', { name: 'Selecionar Gerente' }));

    expect(screen.getByTestId('team-role-badge')).toHaveTextContent('Gerente');
  });

  it('renders the staff role badge on the team detail route', () => {
    vi.mocked(usePathname).mockReturnValue('/dashboard/team/staff-1');
    render(
      <DashboardTopbarStatusProvider initialStaffRoleStatus="MANAGER">
        <Topbar tenantName="Lavacar BH" userName="Ana" />
      </DashboardTopbarStatusProvider>,
    );

    expect(screen.getByTestId('team-role-badge')).toHaveTextContent('Gerente');
  });

  it('does not render the staff role badge on the team list route', () => {
    vi.mocked(usePathname).mockReturnValue('/dashboard/team');
    render(
      <DashboardTopbarStatusProvider initialStaffRoleStatus="STAFF">
        <Topbar tenantName="Lavacar BH" userName="Ana" />
      </DashboardTopbarStatusProvider>,
    );

    expect(screen.queryByTestId('team-role-badge')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Equipe');
  });

  it('renders the service status badge on the edit route and keeps it in sync', async () => {
    vi.mocked(usePathname).mockReturnValue('/dashboard/services/svc-1/edit');

    render(
      <DashboardTopbarStatusProvider initialServiceStatus="INACTIVE">
        <Topbar tenantName="Lavacar BH" userName="Ana" />
        <TopbarStatusProbe />
      </DashboardTopbarStatusProvider>,
    );

    expect(screen.getByText('Inativo')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Ativar serviço' }));

    expect(screen.getByText('Ativo')).toBeInTheDocument();
  });

  it('shows a back link on booking detail routes', () => {
    vi.mocked(usePathname).mockReturnValue('/dashboard/bookings/booking-123');
    render(
      <DashboardTopbarStatusProvider initialBookingStatus="INFO_REQUESTED">
        <Topbar tenantName="Lavacar BH" userName="Ana" />
      </DashboardTopbarStatusProvider>,
    );

    expect(screen.getByRole('link', { name: 'Voltar' })).toHaveAttribute(
      'href',
      '/dashboard/bookings',
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Detalhe do agendamento');
    expect(screen.getByText('Aguardando info')).toBeInTheDocument();
  });

  it('uses explicit overrides on custom detail pages', async () => {
    vi.mocked(usePathname).mockReturnValue('/dashboard/loyalty/c-1');
    render(
      <DashboardTopbarStatusProvider>
        <TopbarSetter href="/dashboard/loyalty" backLabel="Fidelidade" pageTitle="João Silva" />
        <Topbar tenantName="Lavacar BH" userName="Ana" />
      </DashboardTopbarStatusProvider>,
    );

    expect(await screen.findByRole('link', { name: 'Fidelidade' })).toHaveAttribute(
      'href',
      '/dashboard/loyalty',
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('João Silva');
  });

  it('prefers returnTo for booking routes opened from schedule', () => {
    vi.mocked(usePathname).mockReturnValue('/dashboard/bookings/booking-123');

    render(
      <DashboardTopbarStatusProvider initialBookingStatus="INFO_REQUESTED">
        <TopbarSetter
          href="/dashboard/schedule?weekStart=2026-06-29&date=2026-06-29"
          backLabel="Fidelidade"
          pageTitle="João Silva"
        />
        <Topbar tenantName="Lavacar BH" userName="Ana" />
      </DashboardTopbarStatusProvider>,
    );

    expect(screen.getByRole('link', { name: 'Fidelidade' })).toHaveAttribute(
      'href',
      '/dashboard/schedule?weekStart=2026-06-29&date=2026-06-29',
    );
  });

  it('shows the action title and back link on nested booking routes', () => {
    vi.mocked(usePathname).mockReturnValue('/dashboard/bookings/booking-123/complete');
    render(
      <DashboardTopbarStatusProvider initialBookingStatus="APPROVED">
        <Topbar tenantName="Lavacar BH" userName="Ana" />
      </DashboardTopbarStatusProvider>,
    );

    expect(screen.getByRole('link', { name: 'Voltar' })).toHaveAttribute(
      'href',
      '/dashboard/bookings/booking-123',
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Marcar concluído');
    expect(screen.getByText('Aprovado')).toBeInTheDocument();
  });

  it('updates the badge when the provider state changes', async () => {
    vi.mocked(usePathname).mockReturnValue('/dashboard/bookings/booking-123');

    render(
      <DashboardTopbarStatusProvider initialBookingStatus="PENDING">
        <Topbar tenantName="Lavacar BH" userName="Ana" />
        <TopbarStatusProbe />
      </DashboardTopbarStatusProvider>,
    );

    expect(screen.getByText('Pendente')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Marcar aprovado' }));

    expect(screen.getByText('Aprovado')).toBeInTheDocument();
  });

  it('falls back to "Dashboard" for an unrecognised pathname', () => {
    vi.mocked(usePathname).mockReturnValue('/dashboard/unknown');
    render(<Topbar tenantName="Lavacar BH" userName="Ana" />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Dashboard');
  });

  it('renders first-letter logo mark from tenant name', () => {
    render(<Topbar tenantName="Lavacar BH" userName="Ana" />);

    expect(screen.getByText('L')).toBeInTheDocument();
  });

  it('renders a route-specific action when provided', () => {
    render(
      <Topbar
        tenantName="Lavacar BH"
        userName="Ana"
        action={<a href="/dashboard/services/new">+ Criar serviço</a>}
      />,
    );

    expect(screen.getByRole('link', { name: '+ Criar serviço' })).toHaveAttribute(
      'href',
      '/dashboard/services/new',
    );
  });
});
