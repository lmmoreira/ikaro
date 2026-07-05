// @vitest-environment jsdom
import { useEffect } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CustomerTopbar } from './CustomerTopbar';
import {
  CustomerTopbarStatusProvider,
  useCustomerTopbarStatus,
} from './customer-topbar-status-context';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) => {
    if (key === 'topbar.backToSite' && params?.tenantName) return `← ${params.tenantName} site`;
    if (key === 'topbar.switchTenant') return 'Trocar empresa';
    if (key === 'statusApproved') return 'Aprovado';
    return key;
  },
}));

vi.mock('@/features/auth/api', () => ({
  fetchCustomerTenants: vi.fn().mockResolvedValue([]),
}));

import { fetchCustomerTenants } from '@/features/auth/api';

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

    const link = screen
      .getAllByRole('link')
      .find((el) => el.getAttribute('href') === '/lavacar-bh/booking');
    expect(link).toBeInTheDocument();
  });

  it('renders the back-to-site link pointing to /{slug}', () => {
    render(<CustomerTopbar {...DEFAULT_PROPS} />);

    const link = screen
      .getAllByRole('link')
      .find((el) => el.getAttribute('href') === '/lavacar-bh');
    expect(link).toBeInTheDocument();
  });

  it('renders the sign-out link with the full BFF logout URL', () => {
    process.env.NEXT_PUBLIC_BFF_URL = 'https://bff.example.com';
    render(<CustomerTopbar {...DEFAULT_PROPS} />);

    const logoutLink = screen
      .getAllByRole('link')
      .find((el) => el.getAttribute('href')?.includes('/auth/logout'));
    expect(logoutLink).toBeInTheDocument();
    expect(logoutLink?.getAttribute('href')).toBe(
      'https://bff.example.com/auth/logout?tenantSlug=lavacar-bh',
    );
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

  it('shows the tenant brand by default, with no back link or status badge', () => {
    render(<CustomerTopbar {...DEFAULT_PROPS} />);

    expect(screen.getByText('Lavacar BH')).toBeInTheDocument();
    expect(screen.queryByTestId('topbar-booking-status-badge')).not.toBeInTheDocument();
  });

  function BackHrefSetter({
    href,
    label,
  }: {
    readonly href: string;
    readonly label: string;
  }): React.JSX.Element {
    const status = useCustomerTopbarStatus();
    useEffect(() => {
      status?.setBackHrefOverride(href);
      status?.setBackLabelOverride(label);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return <></>;
  }

  function BookingStatusSetter(): React.JSX.Element {
    const status = useCustomerTopbarStatus();
    useEffect(() => {
      status?.setBookingStatus('APPROVED');
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return <></>;
  }

  it('renders a back chevron instead of the tenant brand when backHrefOverride is set', () => {
    render(
      <CustomerTopbarStatusProvider>
        <BackHrefSetter href="/lavacar-bh/my-account/bookings" label="Agendamentos" />
        <CustomerTopbar {...DEFAULT_PROPS} />
      </CustomerTopbarStatusProvider>,
    );

    expect(screen.queryByText('Lavacar BH')).not.toBeInTheDocument();
    const backLink = screen.getByRole('link', { name: 'Agendamentos' });
    expect(backLink).toHaveAttribute('href', '/lavacar-bh/my-account/bookings');
  });

  it('renders the booking status badge when bookingStatus is set', () => {
    render(
      <CustomerTopbarStatusProvider>
        <BookingStatusSetter />
        <CustomerTopbar {...DEFAULT_PROPS} />
      </CustomerTopbarStatusProvider>,
    );

    expect(screen.getByTestId('topbar-booking-status-badge')).toHaveTextContent('Aprovado');
  });
});
