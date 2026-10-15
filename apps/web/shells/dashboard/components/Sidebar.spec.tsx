// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearPublicEnv, stubPublicEnv } from '@/test-utils';
import { Sidebar } from './Sidebar';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      'nav.bookings': 'Agenda',
      'nav.schedulingExceptions': 'Reservas a resolver',
      'nav.schedule': 'Horários',
      'nav.services': 'Serviços',
      'nav.loyalty': 'Fidelidade',
      'nav.leads': 'Leads',
      'nav.resources': 'Recursos',
      'nav.team': 'Equipe',
      'nav.settings': 'Configurações',
      'nav.hotsite': 'Hotsite',
      'nav.managerOnly': 'Somente Gerente',
      'sidebar.roleManager': 'Gerente',
      'sidebar.roleStaff': 'Staff',
      'sidebar.signOut': 'Sair',
    };
    return map[key] ?? key;
  },
}));

const openCount = vi.hoisted(() => ({ value: 3 as number | undefined }));
const countQuery = vi.hoisted(() => vi.fn());
vi.mock('@/features/booking/hooks/useSchedulingExceptions', () => ({
  useOpenSchedulingExceptionsCount: () => {
    countQuery();
    return { data: openCount.value };
  },
}));

vi.mock('next/navigation', () => ({ usePathname: vi.fn() }));
import { usePathname } from 'next/navigation';

const STAFF = 'STAFF' as const;
const MANAGER = 'MANAGER' as const;

beforeEach(() => {
  openCount.value = 3;
  countQuery.mockClear();
  vi.mocked(usePathname).mockReturnValue('/dashboard/bookings');
  stubPublicEnv({ NEXT_PUBLIC_BFF_URL: 'http://bff:3002/v1' });
});

afterEach(() => {
  clearPublicEnv();
});

describe('Sidebar', () => {
  it('renders tenant name and @slug', () => {
    render(
      <Sidebar
        tenantName="Lavacar BH"
        tenantSlug="lavacar-bh"
        userName="Ana Pereira"
        role={STAFF}
        leadFormEnabled={false}
      />,
    );

    expect(screen.getByText('Lavacar BH')).toBeInTheDocument();
    expect(screen.getByText('@lavacar-bh')).toBeInTheDocument();
  });

  it('renders user initials in the footer avatar', () => {
    render(
      <Sidebar
        tenantName="Lavacar BH"
        tenantSlug="lavacar-bh"
        userName="Carlos Gomes"
        role={STAFF}
        leadFormEnabled={false}
      />,
    );

    expect(screen.getByText('CG')).toBeInTheDocument();
  });

  it('renders the core nav items for all roles', () => {
    render(
      <Sidebar
        tenantName="Lavacar BH"
        tenantSlug="lavacar-bh"
        userName="Ana"
        role={STAFF}
        leadFormEnabled={false}
      />,
    );

    expect(screen.getByText('Agenda')).toBeInTheDocument();
    expect(screen.getByText('Horários')).toBeInTheDocument();
    expect(screen.getByText('Serviços')).toBeInTheDocument();
    expect(screen.getByText('Fidelidade')).toBeInTheDocument();
  });

  it('shows the manager-only section for MANAGER role', () => {
    render(
      <Sidebar
        tenantName="Lavacar BH"
        tenantSlug="lavacar-bh"
        userName="Carlos"
        role={MANAGER}
        leadFormEnabled={false}
      />,
    );

    expect(screen.getByText('Recursos')).toBeInTheDocument();
    expect(screen.getByText('Equipe')).toBeInTheDocument();
    expect(screen.getByText('Configurações')).toBeInTheDocument();
    expect(screen.getByText('Hotsite')).toBeInTheDocument();
    expect(screen.getByText('Somente Gerente')).toBeInTheDocument();
  });

  it('hides the manager-only section for STAFF role', () => {
    render(
      <Sidebar
        tenantName="Lavacar BH"
        tenantSlug="lavacar-bh"
        userName="Ana"
        role={STAFF}
        leadFormEnabled={false}
      />,
    );

    expect(screen.queryByText('Recursos')).not.toBeInTheDocument();
    expect(screen.queryByText('Equipe')).not.toBeInTheDocument();
    expect(screen.queryByText('Somente Gerente')).not.toBeInTheDocument();
  });

  it('shows the logout link pointing to the BFF logout route', () => {
    render(
      <Sidebar
        tenantName="Lavacar BH"
        tenantSlug="lavacar-bh"
        userName="Ana"
        role={STAFF}
        leadFormEnabled={false}
      />,
    );

    const logoutLink = screen.getByTitle('Sair');
    expect(logoutLink).toHaveAttribute(
      'href',
      'http://bff:3002/v1/auth/logout?tenantSlug=lavacar-bh',
    );
  });

  it('applies active class to the item matching the current pathname', () => {
    vi.mocked(usePathname).mockReturnValue('/dashboard/services');
    render(
      <Sidebar
        tenantName="Lavacar BH"
        tenantSlug="lavacar-bh"
        userName="Ana"
        role={STAFF}
        leadFormEnabled={false}
      />,
    );

    const servicesLink = screen.getByText('Serviços').closest('a');
    expect(servicesLink?.className).toContain('bg-blue-600');

    const agendaLink = screen.getByText('Agenda').closest('a');
    expect(agendaLink?.className).not.toContain('bg-blue-600');
  });

  it('uses "?" as initials when userName is null', () => {
    render(
      <Sidebar
        tenantName="Lavacar BH"
        tenantSlug="lavacar-bh"
        userName={null}
        role={STAFF}
        leadFormEnabled={false}
      />,
    );

    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('hides "Leads" from the main nav for both roles when leadFormEnabled is false', () => {
    const { rerender } = render(
      <Sidebar
        tenantName="Lavacar BH"
        tenantSlug="lavacar-bh"
        userName="Ana"
        role={STAFF}
        leadFormEnabled={false}
      />,
    );
    expect(screen.queryByText('Leads')).not.toBeInTheDocument();

    rerender(
      <Sidebar
        tenantName="Lavacar BH"
        tenantSlug="lavacar-bh"
        userName="Carlos"
        role={MANAGER}
        leadFormEnabled={false}
      />,
    );
    expect(screen.queryByText('Leads')).not.toBeInTheDocument();
  });

  it('shows "Leads" in the main nav (not the manager-only section) for both roles when leadFormEnabled is true', () => {
    const { rerender } = render(
      <Sidebar
        tenantName="Lavacar BH"
        tenantSlug="lavacar-bh"
        userName="Ana"
        role={STAFF}
        leadFormEnabled={true}
      />,
    );
    expect(screen.getByText('Leads').closest('a')).toHaveAttribute('href', '/dashboard/leads');

    rerender(
      <Sidebar
        tenantName="Lavacar BH"
        tenantSlug="lavacar-bh"
        userName="Carlos"
        role={MANAGER}
        leadFormEnabled={true}
      />,
    );
    const leadsLink = screen.getByText('Leads').closest('a');
    expect(leadsLink).toHaveAttribute('href', '/dashboard/leads');
    // Still rendered inside the main nav, not the "Somente Gerente" section.
    const managerOnlyLabel = screen.getByText('Somente Gerente');
    expect(
      managerOnlyLabel.compareDocumentPosition(leadsLink!) & Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
  });

  describe('"Reservas a resolver" (M23-S14)', () => {
    function renderSidebar(role: 'STAFF' | 'MANAGER') {
      return render(
        <Sidebar
          tenantName="Lavacar BH"
          tenantSlug="lavacar-bh"
          userName="Ana Pereira"
          role={role}
          leadFormEnabled={false}
        />,
      );
    }

    it('shows the item right below "Agenda" for a MANAGER, with the open count', () => {
      renderSidebar(MANAGER);

      const links = screen.getAllByRole('link').map((a) => a.textContent);
      expect(links.indexOf('Agenda') + 1).toBe(
        links.findIndex((t) => t?.startsWith('Reservas a resolver')),
      );
      expect(screen.getByTestId('sidebar-nav-scheduling-exceptions')).toHaveAttribute(
        'href',
        '/dashboard/scheduling-exceptions',
      );
      expect(screen.getByTestId('scheduling-exceptions-badge')).toHaveTextContent('3');
    });

    it('shows no badge when nothing is open', () => {
      openCount.value = 0;
      renderSidebar(MANAGER);

      expect(screen.getByTestId('sidebar-nav-scheduling-exceptions')).toBeInTheDocument();
      expect(screen.queryByTestId('scheduling-exceptions-badge')).not.toBeInTheDocument();
    });

    it('does not show the item to a STAFF user, and never mounts the count query for them', () => {
      renderSidebar(STAFF);

      expect(screen.queryByTestId('sidebar-nav-scheduling-exceptions')).not.toBeInTheDocument();
      expect(screen.queryByText('Reservas a resolver')).not.toBeInTheDocument();
      expect(countQuery).not.toHaveBeenCalled();
    });

    it('marks the item active on its own routes', () => {
      vi.mocked(usePathname).mockReturnValue('/dashboard/scheduling-exceptions');
      renderSidebar(MANAGER);

      expect(screen.getByTestId('sidebar-nav-scheduling-exceptions')).toHaveClass('bg-blue-600');
    });
  });
});
