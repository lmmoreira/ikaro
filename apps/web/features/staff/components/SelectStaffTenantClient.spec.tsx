// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StaffTenantOption } from '@ikaro/types';
import { SelectStaffTenantClient } from './SelectStaffTenantClient';
import { switchStaffTenant } from '@/features/auth/api';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) =>
    ({
      selectTenantHeading: 'Selecione o estabelecimento',
      selectTenantSubtitle: 'Sua conta tem acesso a mais de um estabelecimento.',
      selectTenantError: 'Não foi possível carregar os estabelecimentos.',
      selectTenantRetry: 'Tente novamente',
      roleManager: 'Gerente',
      roleStaff: 'Funcionário',
    })[key] ?? key,
}));

vi.mock('@/features/auth/api', () => ({
  switchStaffTenant: vi.fn(),
}));

function makeOption(overrides: Partial<StaffTenantOption> = {}): StaffTenantOption {
  return {
    staffId: 'staff-1',
    tenantId: 'tenant-1',
    tenantSlug: 'lavacar-beloauto',
    tenantName: 'Lavacar BeloAuto',
    role: 'MANAGER',
    ...overrides,
  };
}

describe('SelectStaffTenantClient', () => {
  beforeEach(() => {
    push.mockReset();
    vi.mocked(switchStaffTenant).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the retry state when the initial options are unavailable', () => {
    render(<SelectStaffTenantClient initialOptions={null} />);

    expect(screen.getByText('Não foi possível carregar os estabelecimentos.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tente novamente' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
  });

  it('renders the tenant options with the correct role labels', () => {
    render(
      <SelectStaffTenantClient
        initialOptions={[
          makeOption({ role: 'MANAGER', tenantName: 'Lavacar BeloAuto' }),
          makeOption({
            staffId: 'staff-2',
            role: 'STAFF',
            tenantName: 'Lavacar Centro',
          }),
        ]}
      />,
    );

    expect(screen.getByRole('button', { name: /Lavacar BeloAuto/ })).toHaveTextContent('Gerente');
    expect(screen.getByRole('button', { name: /Lavacar Centro/ })).toHaveTextContent(
      'Funcionário',
    );
  });

  it('selects the tenant and navigates to the dashboard on success', async () => {
    const user = userEvent.setup();
    vi.mocked(switchStaffTenant).mockResolvedValue(undefined);

    render(<SelectStaffTenantClient initialOptions={[makeOption()]} />);

    await user.click(screen.getByRole('button', { name: /Lavacar BeloAuto/ }));

    expect(switchStaffTenant).toHaveBeenCalledWith('staff-1');
    expect(push).toHaveBeenCalledWith('/dashboard');
  });

  it('shows the retry state when the tenant switch fails', async () => {
    const user = userEvent.setup();
    vi.mocked(switchStaffTenant).mockRejectedValue(new Error('boom'));

    render(<SelectStaffTenantClient initialOptions={[makeOption()]} />);

    await user.click(screen.getByRole('button', { name: /Lavacar BeloAuto/ }));

    expect(screen.getByText('Não foi possível carregar os estabelecimentos.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tente novamente' })).toBeInTheDocument();
  });
});
