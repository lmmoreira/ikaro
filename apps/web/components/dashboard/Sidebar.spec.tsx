// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Sidebar } from './Sidebar';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      'nav.bookings': 'Agenda',
      'nav.schedule': 'Horários',
      'nav.services': 'Serviços',
      'nav.loyalty': 'Fidelidade',
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

vi.mock('next/navigation', () => ({ usePathname: vi.fn() }));
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

import { usePathname } from 'next/navigation';

const STAFF = 'STAFF' as const;
const MANAGER = 'MANAGER' as const;

beforeEach(() => {
  vi.mocked(usePathname).mockReturnValue('/dashboard/bookings');
  process.env.NEXT_PUBLIC_BFF_URL = 'http://bff:3002/v1';
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_BFF_URL;
});

describe('Sidebar', () => {
  it('renders tenant name and @slug', () => {
    render(
      <Sidebar
        tenantName="Lavacar BH"
        tenantSlug="lavacar-bh"
        userName="Ana Pereira"
        role={STAFF}
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
      />,
    );

    expect(screen.getByText('CG')).toBeInTheDocument();
  });

  it('renders the core nav items for all roles', () => {
    render(<Sidebar tenantName="Lavacar BH" tenantSlug="lavacar-bh" userName="Ana" role={STAFF} />);

    expect(screen.getByText('Agenda')).toBeInTheDocument();
    expect(screen.getByText('Horários')).toBeInTheDocument();
    expect(screen.getByText('Serviços')).toBeInTheDocument();
    expect(screen.getByText('Fidelidade')).toBeInTheDocument();
  });

  it('shows the manager-only section for MANAGER role', () => {
    render(
      <Sidebar tenantName="Lavacar BH" tenantSlug="lavacar-bh" userName="Carlos" role={MANAGER} />,
    );

    expect(screen.getByText('Equipe')).toBeInTheDocument();
    expect(screen.getByText('Configurações')).toBeInTheDocument();
    expect(screen.getByText('Hotsite')).toBeInTheDocument();
    expect(screen.getByText('Somente Gerente')).toBeInTheDocument();
  });

  it('hides the manager-only section for STAFF role', () => {
    render(<Sidebar tenantName="Lavacar BH" tenantSlug="lavacar-bh" userName="Ana" role={STAFF} />);

    expect(screen.queryByText('Equipe')).not.toBeInTheDocument();
    expect(screen.queryByText('Somente Gerente')).not.toBeInTheDocument();
  });

  it('shows the logout link pointing to the BFF logout route', () => {
    render(<Sidebar tenantName="Lavacar BH" tenantSlug="lavacar-bh" userName="Ana" role={STAFF} />);

    const logoutLink = screen.getByTitle('Sair');
    expect(logoutLink).toHaveAttribute(
      'href',
      'http://bff:3002/v1/auth/logout?tenantSlug=lavacar-bh',
    );
  });

  it('applies active class to the item matching the current pathname', () => {
    vi.mocked(usePathname).mockReturnValue('/dashboard/services');
    render(<Sidebar tenantName="Lavacar BH" tenantSlug="lavacar-bh" userName="Ana" role={STAFF} />);

    const servicesLink = screen.getByText('Serviços').closest('a');
    expect(servicesLink?.className).toContain('bg-blue-600');

    const agendaLink = screen.getByText('Agenda').closest('a');
    expect(agendaLink?.className).not.toContain('bg-blue-600');
  });

  it('uses "?" as initials when userName is null', () => {
    render(
      <Sidebar tenantName="Lavacar BH" tenantSlug="lavacar-bh" userName={null} role={STAFF} />,
    );

    expect(screen.getByText('?')).toBeInTheDocument();
  });
});
