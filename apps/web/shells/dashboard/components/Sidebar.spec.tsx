// @vitest-environment jsdom
import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearPublicEnv, stubPublicEnv } from '@/test-utils';
import { resolveDashboardNav } from '@/shells/dashboard/model/dashboard-nav';
import { Sidebar as SidebarView } from './Sidebar';

// The shell resolves the navigation once and hands it to the sidebar; these cases state the facts
// (role, the lead-form switch, the locked features) and let the registry resolve them, as the shell
// does.
type SidebarProps = Omit<ComponentProps<typeof SidebarView>, 'nav'> & {
  readonly leadFormEnabled: boolean;
};

function Sidebar({ leadFormEnabled, ...props }: SidebarProps): React.JSX.Element {
  const nav = resolveDashboardNav({
    role: props.role,
    lockedFeatures: props.lockedFeatures,
    toggles: { leadForm: leadFormEnabled },
  });
  return <SidebarView {...props} nav={nav} />;
}

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
  it('paints the rail with the sidebar token, not a hex', () => {
    const { container } = render(
      <Sidebar
        tenantName="Lavacar BH"
        tenantSlug="lavacar-bh"
        userName="Ana Pereira"
        role={STAFF}
        leadFormEnabled={false}
        lockedFeatures={[]}
      />,
    );

    expect(container.querySelector('aside')).toHaveClass('bg-sidebar');
  });

  it('renders tenant name and @slug', () => {
    render(
      <Sidebar
        tenantName="Lavacar BH"
        tenantSlug="lavacar-bh"
        userName="Ana Pereira"
        role={STAFF}
        leadFormEnabled={false}
        lockedFeatures={[]}
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
        lockedFeatures={[]}
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
        lockedFeatures={[]}
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
        lockedFeatures={[]}
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
        lockedFeatures={[]}
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
        lockedFeatures={[]}
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
        lockedFeatures={[]}
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
        lockedFeatures={[]}
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
        lockedFeatures={[]}
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
        lockedFeatures={[]}
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
        lockedFeatures={[]}
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
        lockedFeatures={[]}
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
          lockedFeatures={[]}
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

describe('Sidebar — locked items (UC-125)', () => {
  function renderLocked(
    role: 'STAFF' | 'MANAGER',
    lockedFeatures: readonly ('HOTSITE' | 'BOOKING' | 'LOYALTY' | 'CHATBOT' | 'LEAD_FORM')[],
    leadFormEnabled = false,
  ) {
    return render(
      <Sidebar
        tenantName="Lavacar BH"
        tenantSlug="lavacar-bh"
        userName="Ana Pereira"
        role={role}
        leadFormEnabled={leadFormEnabled}
        lockedFeatures={lockedFeatures}
      />,
    );
  }

  it('shows a locked feature as a padlocked item that keeps its real href, never hidden', () => {
    renderLocked(MANAGER, ['LOYALTY']);

    const item = screen.getByRole('link', { name: /Fidelidade/ });
    expect(item).toHaveAttribute('href', '/dashboard/loyalty');
    expect(item).toHaveAttribute('data-locked', 'true');
    // The label keeps the colour of any inactive item; only the icon is dimmed.
    expect(item).not.toHaveClass('opacity-60');
    expect(screen.getAllByTestId('nav-lock')).toHaveLength(1);
  });

  it('draws no padlock when nothing is locked (a failed lookup fails open)', () => {
    renderLocked(MANAGER, []);

    expect(screen.queryByTestId('nav-lock')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Fidelidade' })).not.toHaveAttribute('data-locked');
  });

  it('locks the same items for STAFF, who see the padlock too', () => {
    renderLocked(STAFF, ['LOYALTY']);

    expect(screen.getByRole('link', { name: /Fidelidade/ })).toHaveAttribute('data-locked', 'true');
  });

  it('locks the manager-only items by their feature and mounts no count query for a locked BOOKING', () => {
    renderLocked(MANAGER, ['BOOKING']);

    expect(screen.getByTestId('sidebar-nav-resources')).toHaveAttribute('data-locked', 'true');
    expect(screen.getByTestId('sidebar-nav-scheduling-exceptions')).toHaveAttribute(
      'data-locked',
      'true',
    );
    expect(screen.queryByTestId('scheduling-exceptions-badge')).not.toBeInTheDocument();
    expect(countQuery).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: /Equipe/ })).not.toHaveAttribute('data-locked');
  });

  describe('Leads has three states', () => {
    it('shows it normally when entitled and enabled', () => {
      renderLocked(MANAGER, [], true);

      expect(screen.getByTestId('sidebar-nav-leads')).not.toHaveAttribute('data-locked');
    });

    it('hides it when entitled but not enabled by the manager (as before billing)', () => {
      renderLocked(MANAGER, [], false);

      expect(screen.queryByTestId('sidebar-nav-leads')).not.toBeInTheDocument();
    });

    it.each([MANAGER, STAFF])('shows it locked for %s when the tenant is not entitled', (role) => {
      renderLocked(role, ['LEAD_FORM'], false);

      const leads = screen.getByTestId('sidebar-nav-leads');
      expect(leads).toHaveAttribute('href', '/dashboard/leads');
      expect(leads).toHaveAttribute('data-locked', 'true');
    });
  });
});
