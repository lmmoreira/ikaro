// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getHotsiteCustomerProfile } from '@/lib/api/customers';
import { fetchCustomerTenants } from '@/lib/api/auth';
import { getHotsiteStaffProfile } from '@/lib/api/staff';
import { renderWithIntl } from '@/test-utils';
import { HotsiteAuthBar } from './HotsiteAuthBar';

vi.mock('@/lib/api/customers', () => ({
  getHotsiteCustomerProfile: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  fetchCustomerTenants: vi.fn(),
}));

vi.mock('@/lib/api/staff', () => ({
  getHotsiteStaffProfile: vi.fn(),
}));

const authenticatedProfile = {
  customerId: 'c-1',
  email: 'joao@example.com',
  name: 'João Silva',
  phone: null,
  defaultAddress: null,
};

const staffProfileFixture = {
  id: 's-1',
  email: 'gerente@lavacar.com.br',
  name: 'Gerente Silva',
  role: 'MANAGER' as const,
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
};

describe('HotsiteAuthBar', () => {
  const originalBffUrl = process.env.NEXT_PUBLIC_BFF_URL;

  afterEach(() => {
    vi.mocked(getHotsiteCustomerProfile).mockReset();
    vi.mocked(fetchCustomerTenants).mockReset();
    vi.mocked(getHotsiteStaffProfile).mockReset();
    if (originalBffUrl === undefined) {
      delete process.env.NEXT_PUBLIC_BFF_URL;
    } else {
      process.env.NEXT_PUBLIC_BFF_URL = originalBffUrl;
    }
  });

  it('renders the "Área da Equipe" login link when no staff is authenticated', () => {
    vi.mocked(getHotsiteCustomerProfile).mockReturnValue(new Promise(() => {}));
    vi.mocked(getHotsiteStaffProfile).mockReturnValue(new Promise(() => {}));

    renderWithIntl(<HotsiteAuthBar slug="lavacar-beloauto" />);

    const staffLink = screen.getByTestId('hotsite-staff-link');
    expect(staffLink).toHaveAttribute('href', '/dashboard/login?tenantSlug=lavacar-beloauto');
    expect(staffLink).toHaveTextContent('Área da Equipe');
  });

  it('renders staff name linking to /dashboard when authenticated as staff', async () => {
    vi.mocked(getHotsiteCustomerProfile).mockResolvedValue(null);
    vi.mocked(getHotsiteStaffProfile).mockResolvedValue(staffProfileFixture);

    renderWithIntl(<HotsiteAuthBar slug="lavacar-beloauto" />);

    const staffLink = await screen.findByTestId('hotsite-staff-authenticated-link');
    expect(staffLink).toHaveAttribute('href', '/dashboard');
    expect(staffLink).toHaveTextContent('Gerente Silva');
  });

  it('renders a logout link for authenticated staff pointing to the BFF logout route', async () => {
    process.env.NEXT_PUBLIC_BFF_URL = 'http://bff-test:3002/v1';
    vi.mocked(getHotsiteCustomerProfile).mockResolvedValue(null);
    vi.mocked(getHotsiteStaffProfile).mockResolvedValue(staffProfileFixture);

    renderWithIntl(<HotsiteAuthBar slug="lavacar-beloauto" />);

    const logoutLink = await screen.findByTestId('hotsite-staff-logout-link');
    expect(logoutLink).toHaveAttribute(
      'href',
      'http://bff-test:3002/v1/auth/logout?tenantSlug=lavacar-beloauto',
    );
    expect(logoutLink).toHaveTextContent('Sair');
  });

  it('falls back to email when authenticated staff has no name', async () => {
    vi.mocked(getHotsiteCustomerProfile).mockResolvedValue(null);
    vi.mocked(getHotsiteStaffProfile).mockResolvedValue({ ...staffProfileFixture, name: null });

    renderWithIntl(<HotsiteAuthBar slug="lavacar-beloauto" />);

    const staffLink = await screen.findByTestId('hotsite-staff-authenticated-link');
    expect(staffLink).toHaveTextContent('gerente@lavacar.com.br');
  });

  it('renders nothing visible while the profile request is pending', () => {
    vi.mocked(getHotsiteCustomerProfile).mockReturnValue(new Promise(() => {}));
    vi.mocked(getHotsiteStaffProfile).mockReturnValue(new Promise(() => {}));

    renderWithIntl(<HotsiteAuthBar slug="lavacar-beloauto" />);

    expect(screen.queryByText('Entrar')).not.toBeInTheDocument();
    expect(screen.queryByText('Minha conta')).not.toBeInTheDocument();
  });

  it('renders "Entrar" linking to /{slug}/login when unauthenticated', async () => {
    vi.mocked(getHotsiteCustomerProfile).mockResolvedValue(null);
    vi.mocked(getHotsiteStaffProfile).mockReturnValue(new Promise(() => {}));

    renderWithIntl(<HotsiteAuthBar slug="lavacar-beloauto" />);

    const link = await screen.findByText('Entrar');
    expect(link).toHaveAttribute('href', '/lavacar-beloauto/login');
  });

  it('renders initials and name when authenticated', async () => {
    vi.mocked(getHotsiteCustomerProfile).mockResolvedValue(authenticatedProfile);
    vi.mocked(fetchCustomerTenants).mockResolvedValue([
      { id: 't-1', name: 'Lavacar BH', slug: 'lavacar-beloauto', loyaltyPoints: 10 },
    ]);
    vi.mocked(getHotsiteStaffProfile).mockReturnValue(new Promise(() => {}));

    renderWithIntl(<HotsiteAuthBar slug="lavacar-beloauto" />);

    expect(await screen.findByText('João Silva')).toBeInTheDocument();
    expect(screen.getByText('JS')).toBeInTheDocument();
    expect(screen.getByTestId('hotsite-auth-tenant-slug')).toHaveTextContent('lavacar-beloauto');
  });

  it('opens the dropdown with correct links when the avatar is clicked', async () => {
    vi.mocked(getHotsiteCustomerProfile).mockResolvedValue(authenticatedProfile);
    vi.mocked(fetchCustomerTenants).mockResolvedValue([
      { id: 't-1', name: 'Lavacar BH', slug: 'lavacar-beloauto', loyaltyPoints: 10 },
    ]);
    vi.mocked(getHotsiteStaffProfile).mockReturnValue(new Promise(() => {}));
    process.env.NEXT_PUBLIC_BFF_URL = 'http://bff-test:3002/v1';

    renderWithIntl(<HotsiteAuthBar slug="lavacar-beloauto" />);
    await screen.findByText('João Silva');

    const summary = screen.getByText('João Silva').closest('summary');
    expect(summary).not.toBeNull();
    await userEvent.click(summary as HTMLElement);

    const myAccountLink = screen.getByText('Minha conta');
    expect(myAccountLink).toHaveAttribute('href', '/lavacar-beloauto/my-account');

    const logoutLink = screen.getByText('Sair');
    expect(logoutLink).toHaveAttribute(
      'href',
      'http://bff-test:3002/v1/auth/logout?tenantSlug=lavacar-beloauto',
    );
  });

  it('shows "Trocar empresa" in the dropdown when the customer has 2+ tenants', async () => {
    vi.mocked(getHotsiteCustomerProfile).mockResolvedValue(authenticatedProfile);
    vi.mocked(fetchCustomerTenants).mockResolvedValue([
      { id: 't-1', name: 'Lavacar BH', slug: 'lavacar-beloauto', loyaltyPoints: 10 },
      { id: 't-2', name: 'SuperClean', slug: 'superclean', loyaltyPoints: 8 },
    ]);
    vi.mocked(getHotsiteStaffProfile).mockReturnValue(new Promise(() => {}));

    renderWithIntl(<HotsiteAuthBar slug="lavacar-beloauto" />);
    await screen.findByText('João Silva');
    await userEvent.click(screen.getByText('João Silva').closest('summary') as HTMLElement);

    const switchLink = await screen.findByTestId('hotsite-switch-tenant-link');
    expect(switchLink).toHaveAttribute('href', '/switch-tenant');
  });

  it('hides "Trocar empresa" when the customer has only one tenant', async () => {
    vi.mocked(getHotsiteCustomerProfile).mockResolvedValue(authenticatedProfile);
    vi.mocked(fetchCustomerTenants).mockResolvedValue([
      { id: 't-1', name: 'Lavacar BH', slug: 'lavacar-beloauto', loyaltyPoints: 10 },
    ]);
    vi.mocked(getHotsiteStaffProfile).mockReturnValue(new Promise(() => {}));

    renderWithIntl(<HotsiteAuthBar slug="lavacar-beloauto" />);
    await screen.findByText('João Silva');
    await userEvent.click(screen.getByText('João Silva').closest('summary') as HTMLElement);

    expect(screen.queryByTestId('hotsite-switch-tenant-link')).not.toBeInTheDocument();
  });
});
