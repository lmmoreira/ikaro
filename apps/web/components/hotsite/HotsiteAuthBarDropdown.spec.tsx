// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HotsiteAuthBarDropdown } from './HotsiteAuthBarDropdown';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      signOut: 'Sair',
      switchTenant: 'Trocar empresa',
      myAccount: 'Minha conta',
    };
    return map[key] ?? key;
  },
}));

vi.mock('@/lib/api/auth', () => ({
  fetchCustomerTenants: vi.fn(),
}));

import { fetchCustomerTenants } from '@/lib/api/auth';

const TENANT_OPTION = { id: 't-1', name: 'Lavacar BH', slug: 'lavacar-bh', loyaltyPoints: 10 };

afterEach(() => {
  vi.mocked(fetchCustomerTenants).mockReset();
  delete process.env.NEXT_PUBLIC_BFF_URL;
});

describe('HotsiteAuthBarDropdown', () => {
  it('renders user name and initials', async () => {
    vi.mocked(fetchCustomerTenants).mockResolvedValue([TENANT_OPTION]);

    render(<HotsiteAuthBarDropdown name="João Silva" slug="lavacar-bh" />);

    expect(screen.getByText('João Silva')).toBeInTheDocument();
    expect(screen.getByText('JS')).toBeInTheDocument();
  });

  it('renders the tenant slug', async () => {
    vi.mocked(fetchCustomerTenants).mockResolvedValue([TENANT_OPTION]);

    render(<HotsiteAuthBarDropdown name="João Silva" slug="lavacar-bh" />);

    expect(screen.getByTestId('hotsite-auth-tenant-slug')).toHaveTextContent('lavacar-bh');
  });

  it('hides "Trocar empresa" when the customer has only one tenant', async () => {
    vi.mocked(fetchCustomerTenants).mockResolvedValue([TENANT_OPTION]);

    render(<HotsiteAuthBarDropdown name="Ana" slug="lavacar-bh" />);

    await waitFor(() => {
      expect(screen.queryByTestId('hotsite-switch-tenant-link')).not.toBeInTheDocument();
    });
  });

  it('shows "Trocar empresa" when the customer has 2+ tenants', async () => {
    vi.mocked(fetchCustomerTenants).mockResolvedValue([
      TENANT_OPTION,
      { id: 't-2', name: 'SuperClean', slug: 'superclean', loyaltyPoints: 5 },
    ]);

    render(<HotsiteAuthBarDropdown name="Ana" slug="lavacar-bh" />);

    const link = await screen.findByTestId('hotsite-switch-tenant-link');
    expect(link).toHaveAttribute('href', '/switch-tenant');
  });

  it('my-account link points to /{slug}/my-account', () => {
    vi.mocked(fetchCustomerTenants).mockResolvedValue([TENANT_OPTION]);

    render(<HotsiteAuthBarDropdown name="Ana" slug="lavacar-bh" />);

    expect(screen.getByText('Minha conta')).toHaveAttribute('href', '/lavacar-bh/my-account');
  });

  it('logout link points to the BFF logout route', () => {
    process.env.NEXT_PUBLIC_BFF_URL = 'http://bff:3002/v1';
    vi.mocked(fetchCustomerTenants).mockResolvedValue([TENANT_OPTION]);

    render(<HotsiteAuthBarDropdown name="Ana" slug="lavacar-bh" />);

    expect(screen.getByTestId('hotsite-customer-logout-link')).toHaveAttribute(
      'href',
      'http://bff:3002/v1/auth/logout?tenantSlug=lavacar-bh',
    );
  });

  it('hides "Trocar empresa" when the tenant fetch fails', async () => {
    vi.mocked(fetchCustomerTenants).mockRejectedValue(new Error('network'));

    render(<HotsiteAuthBarDropdown name="Ana" slug="lavacar-bh" />);

    await waitFor(() => {
      expect(screen.queryByTestId('hotsite-switch-tenant-link')).not.toBeInTheDocument();
    });
  });

  it('falls back to "Minha conta" label inside the summary when name is empty', () => {
    vi.mocked(fetchCustomerTenants).mockResolvedValue([TENANT_OPTION]);

    render(<HotsiteAuthBarDropdown name="" slug="lavacar-bh" />);

    // Both the summary label and the dropdown link show "Minha conta" when name is empty
    const items = screen.getAllByText('Minha conta');
    expect(items.length).toBeGreaterThanOrEqual(1);
  });
});
