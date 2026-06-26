// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CustomerTopbar } from './CustomerTopbar';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) => {
    if (key === 'topbar.backToSite' && params?.tenantName) return `← ${params.tenantName} site`;
    if (key === 'topbar.switchTenant') return 'Trocar empresa';
    return key;
  },
}));

vi.mock('@/lib/api/auth', () => ({
  fetchCustomerTenants: vi.fn().mockResolvedValue([]),
}));

import { fetchCustomerTenants } from '@/lib/api/auth';

const DEFAULT_PROPS = {
  tenantName: 'Lavacar BH',
  tenantSlug: 'lavacar-bh',
  userName: 'Ana Pereira',
} as const;

describe('CustomerTopbar', () => {
  it('renders the tenant brand name', () => {
    render(<CustomerTopbar {...DEFAULT_PROPS} />);

    expect(screen.getByText('Lavacar BH')).toBeInTheDocument();
  });

  it('shows the user name on desktop (topbar-user-name)', () => {
    render(<CustomerTopbar {...DEFAULT_PROPS} />);

    expect(screen.getByTestId('topbar-user-name')).toHaveTextContent('Ana Pereira');
  });

  it('shows "?" initials when userName is null', () => {
    render(<CustomerTopbar tenantName="Lavacar BH" tenantSlug="lavacar-bh" userName={null} />);

    expect(screen.getByTestId('topbar-user-name')).toHaveTextContent('');
  });

  it('renders the new-booking link pointing to /{slug}/booking', () => {
    render(<CustomerTopbar {...DEFAULT_PROPS} />);

    const link = screen.getAllByRole('link').find((el) => el.getAttribute('href') === '/lavacar-bh/booking');
    expect(link).toBeInTheDocument();
  });

  it('renders the back-to-site link pointing to /{slug}', () => {
    render(<CustomerTopbar {...DEFAULT_PROPS} />);

    const link = screen.getAllByRole('link').find((el) => el.getAttribute('href') === '/lavacar-bh');
    expect(link).toBeInTheDocument();
  });

  it('renders the sign-out link with the full BFF logout URL', () => {
    process.env.NEXT_PUBLIC_BFF_URL = 'https://bff.example.com';
    render(<CustomerTopbar {...DEFAULT_PROPS} />);

    const logoutLink = screen.getAllByRole('link').find((el) => el.getAttribute('href')?.includes('/auth/logout'));
    expect(logoutLink).toBeInTheDocument();
    expect(logoutLink?.getAttribute('href')).toBe('https://bff.example.com/auth/logout?tenantSlug=lavacar-bh');
  });

  it('shows "Trocar empresa" link when customer has multiple tenants', async () => {
    vi.mocked(fetchCustomerTenants).mockResolvedValueOnce([
      { id: 'a', name: 'Tenant A', slug: 'tenant-a', loyaltyPoints: 0 },
      { id: 'b', name: 'Tenant B', slug: 'tenant-b', loyaltyPoints: 0 },
    ]);

    render(<CustomerTopbar {...DEFAULT_PROPS} />);

    const link = await screen.findByTestId('switch-tenant-link');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/switch-tenant');
  });

  it('hides "Trocar empresa" link when customer has only one tenant', async () => {
    vi.mocked(fetchCustomerTenants).mockResolvedValueOnce([
      { id: 'a', name: 'Tenant A', slug: 'tenant-a', loyaltyPoints: 0 },
    ]);

    render(<CustomerTopbar {...DEFAULT_PROPS} />);

    await screen.findByTestId('topbar-user-name');
    expect(screen.queryByTestId('switch-tenant-link')).not.toBeInTheDocument();
  });
});
