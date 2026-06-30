// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

vi.mock('@/lib/utils/format-today', () => ({
  formatTodayLabel: (_locale: string, prefix: string) => `${prefix} 26 de junho de 2026`,
}));

vi.mock('next/navigation', () => ({ usePathname: vi.fn() }));

import { usePathname } from 'next/navigation';

function TopbarStatusProbe(): React.JSX.Element {
  const { setBookingStatus } = useDashboardTopbarStatus()!;
  return (
    <button type="button" onClick={() => setBookingStatus('APPROVED')}>
      Marcar aprovado
    </button>
  );
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
    render(<Topbar tenantName="Lavacar BH" userName="Ana" />);

    expect(screen.getByRole('link', { name: 'Voltar' })).toHaveAttribute(
      'href',
      '/dashboard/services',
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Criar serviço');
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
    render(<Topbar tenantName="Lavacar BH" userName="Ana" />);

    expect(screen.getByRole('link', { name: 'Editar serviço' })).toHaveAttribute(
      'href',
      '/dashboard/services/svc-1/edit',
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Desativar serviço');
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
      '/dashboard/bookings/booking-123',
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Detalhe do agendamento');
    expect(screen.getByText('Aguardando info')).toBeInTheDocument();
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
