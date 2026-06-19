// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getHotsiteCustomerProfile } from '@/lib/api/customers';
import { HotsiteAuthBar } from './HotsiteAuthBar';

vi.mock('@/lib/api/customers', () => ({
  getHotsiteCustomerProfile: vi.fn(),
}));

describe('HotsiteAuthBar', () => {
  const originalBffUrl = process.env.NEXT_PUBLIC_BFF_URL;

  afterEach(() => {
    vi.mocked(getHotsiteCustomerProfile).mockReset();
    if (originalBffUrl === undefined) {
      delete process.env.NEXT_PUBLIC_BFF_URL;
    } else {
      process.env.NEXT_PUBLIC_BFF_URL = originalBffUrl;
    }
  });

  it('renders nothing visible while the profile request is pending', () => {
    vi.mocked(getHotsiteCustomerProfile).mockReturnValue(new Promise(() => {}));

    render(<HotsiteAuthBar slug="lavacar-beloauto" />);

    expect(screen.queryByText('Entrar')).not.toBeInTheDocument();
    expect(screen.queryByText('Minha conta')).not.toBeInTheDocument();
  });

  it('renders "Entrar" linking to /{slug}/login when unauthenticated', async () => {
    vi.mocked(getHotsiteCustomerProfile).mockResolvedValue(null);

    render(<HotsiteAuthBar slug="lavacar-beloauto" />);

    const link = await screen.findByText('Entrar');
    expect(link).toHaveAttribute('href', '/lavacar-beloauto/login');
  });

  it('renders initials and name when authenticated', async () => {
    vi.mocked(getHotsiteCustomerProfile).mockResolvedValue({
      customerId: 'c-1',
      email: 'joao@example.com',
      name: 'João Silva',
      phone: null,
      defaultAddress: null,
    });

    render(<HotsiteAuthBar slug="lavacar-beloauto" />);

    expect(await screen.findByText('João Silva')).toBeInTheDocument();
    expect(screen.getByText('JS')).toBeInTheDocument();
  });

  it('opens the dropdown with correct links when the avatar is clicked', async () => {
    vi.mocked(getHotsiteCustomerProfile).mockResolvedValue({
      customerId: 'c-1',
      email: 'joao@example.com',
      name: 'João Silva',
      phone: null,
      defaultAddress: null,
    });
    process.env.NEXT_PUBLIC_BFF_URL = 'http://bff-test:3002/v1';

    render(<HotsiteAuthBar slug="lavacar-beloauto" />);
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
});
