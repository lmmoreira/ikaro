// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CustomerShell } from './CustomerShell';

vi.mock('next/navigation', () => ({
  usePathname: () => '/lavacar-bh/my-account',
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) => {
    if (key === 'topbar.backToSite' && params?.tenantName) return `← ${params.tenantName} site`;
    return key;
  },
}));

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

const DEFAULT_PROPS = {
  tenantName: 'Lavacar BH',
  tenantSlug: 'lavacar-bh',
  userName: 'Ana Pereira',
} as const;

describe('CustomerShell', () => {
  it('renders children inside the main content area', () => {
    render(
      <CustomerShell {...DEFAULT_PROPS}>
        <p>Conteúdo da página</p>
      </CustomerShell>,
    );

    expect(screen.getByText('Conteúdo da página')).toBeInTheDocument();
  });

  it('shows the tenant name in the topbar brand', () => {
    render(<CustomerShell {...DEFAULT_PROPS}>x</CustomerShell>);

    expect(screen.getByText('Lavacar BH')).toBeInTheDocument();
  });

  it('shows the user name in the avatar dropdown', () => {
    render(<CustomerShell {...DEFAULT_PROPS}>x</CustomerShell>);

    expect(screen.getByTestId('dropdown-user-name')).toHaveTextContent('Ana Pereira');
  });

  it('shows the user name on desktop next to avatar (topbar-user-name)', () => {
    render(<CustomerShell {...DEFAULT_PROPS}>x</CustomerShell>);

    expect(screen.getByTestId('topbar-user-name')).toHaveTextContent('Ana Pereira');
  });

  it('renders the desktop tab nav in the document', () => {
    render(<CustomerShell {...DEFAULT_PROPS}>x</CustomerShell>);

    expect(screen.getByRole('navigation', { name: 'customer-tabs' })).toBeInTheDocument();
  });

  it('renders the mobile bottom nav in the document', () => {
    render(<CustomerShell {...DEFAULT_PROPS}>x</CustomerShell>);

    expect(screen.getByRole('navigation', { name: 'customer-bottom-nav' })).toBeInTheDocument();
  });

  it('marks Início as active when pathname is the my-account root', () => {
    render(<CustomerShell {...DEFAULT_PROPS}>x</CustomerShell>);

    const tabNav = screen.getByRole('navigation', { name: 'customer-tabs' });
    const homeLink = tabNav.querySelector('a[href="/lavacar-bh/my-account"]');
    expect(homeLink?.className).toContain('border-blue-600');
    expect(homeLink?.className).toContain('text-blue-600');
  });

  it('marks Agendamentos and Fidelidade as inactive when on root', () => {
    render(<CustomerShell {...DEFAULT_PROPS}>x</CustomerShell>);

    const tabNav = screen.getByRole('navigation', { name: 'customer-tabs' });
    const bookingsLink = tabNav.querySelector('a[href="/lavacar-bh/my-account/bookings"]');
    const loyaltyLink = tabNav.querySelector('a[href="/lavacar-bh/my-account/loyalty"]');
    expect(bookingsLink?.className).toContain('border-transparent');
    expect(loyaltyLink?.className).toContain('border-transparent');
  });

  it('renders the "+ Novo agendamento" link pointing to /{slug}/booking', () => {
    render(<CustomerShell {...DEFAULT_PROPS}>x</CustomerShell>);

    const newBookingLinks = screen
      .getAllByRole('link')
      .filter((el) => el.getAttribute('href') === '/lavacar-bh/booking');
    expect(newBookingLinks.length).toBeGreaterThanOrEqual(1);
  });

  it('renders the back-to-site link pointing to /{slug}', () => {
    render(<CustomerShell {...DEFAULT_PROPS}>x</CustomerShell>);

    const siteLink = screen
      .getAllByRole('link')
      .find((el) => el.getAttribute('href') === '/lavacar-bh');
    expect(siteLink).toBeInTheDocument();
  });

  it('renders the sign-out link pointing to BFF logout', () => {
    render(<CustomerShell {...DEFAULT_PROPS}>x</CustomerShell>);

    const logoutLink = screen
      .getAllByRole('link')
      .find((el) => el.getAttribute('href')?.includes('/auth/logout'));
    expect(logoutLink).toBeInTheDocument();
    expect(logoutLink?.getAttribute('href')).toContain('tenantSlug=lavacar-bh');
  });

  it('handles null userName gracefully (shows ? initials)', () => {
    render(
      <CustomerShell tenantName="Lavacar BH" tenantSlug="lavacar-bh" userName={null}>
        x
      </CustomerShell>,
    );

    expect(screen.getByTestId('dropdown-user-name')).toHaveTextContent('');
  });
});
