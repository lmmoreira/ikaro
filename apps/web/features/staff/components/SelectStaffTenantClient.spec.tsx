// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StaffTenantOption } from '@ikaro/types';
import { SelectStaffTenantClient } from './SelectStaffTenantClient';
import { switchStaffTenant } from '@/features/auth/api';
import { FetchError } from '@/shared/lib/api/errors';

const push = vi.fn();
const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'pt-BR',
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
    refresh.mockReset();
    vi.mocked(switchStaffTenant).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows the load failure as an alert with a retry that refreshes the page', async () => {
    const user = userEvent.setup();
    render(<SelectStaffTenantClient initialOptions={null} />);

    const feedback = screen.getByTestId('page-feedback');
    expect(feedback).toHaveAttribute('role', 'alert');
    expect(
      within(feedback).getByText('Não foi possível carregar os estabelecimentos.'),
    ).toBeInTheDocument();

    await user.click(within(feedback).getByRole('button', { name: 'Tente novamente' }));

    expect(refresh).toHaveBeenCalledOnce();
    expect(screen.queryByRole('link', { name: 'Tente novamente' })).not.toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: /Lavacar Centro/ })).toHaveTextContent('Funcionário');
  });

  it('selects the tenant and navigates to the dashboard on success', async () => {
    const user = userEvent.setup();
    vi.mocked(switchStaffTenant).mockResolvedValue({ tenantSlug: 'lavacar-beloauto' });

    render(<SelectStaffTenantClient initialOptions={[makeOption()]} />);

    await user.click(screen.getByRole('button', { name: /Lavacar BeloAuto/ }));

    expect(switchStaffTenant).toHaveBeenCalledWith('staff-1');
    expect(push).toHaveBeenCalledWith('/dashboard');
  });

  it('keeps the list and shows the backend message when the tenant switch fails', async () => {
    const user = userEvent.setup();
    vi.mocked(switchStaffTenant).mockRejectedValue(
      new FetchError('Switch failed', 403, 'BFF_STAFF_NOT_REGISTERED_IN_TENANT'),
    );

    render(<SelectStaffTenantClient initialOptions={[makeOption()]} />);

    await user.click(screen.getByRole('button', { name: /Lavacar BeloAuto/ }));

    const feedback = await screen.findByTestId('page-feedback');
    expect(feedback).toHaveAttribute('role', 'alert');
    expect(feedback).toHaveTextContent('Você não está registrado neste estabelecimento.');
    expect(screen.getByRole('button', { name: /Lavacar BeloAuto/ })).toBeEnabled();
    expect(push).not.toHaveBeenCalled();
  });

  it('clears the switch failure when the user picks again', async () => {
    const user = userEvent.setup();
    vi.mocked(switchStaffTenant)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ tenantSlug: 'lavacar-beloauto' });

    render(<SelectStaffTenantClient initialOptions={[makeOption()]} />);

    await user.click(screen.getByRole('button', { name: /Lavacar BeloAuto/ }));
    expect(await screen.findByTestId('page-feedback')).toHaveTextContent(
      'Algo deu errado. Tente novamente.',
    );

    await user.click(screen.getByRole('button', { name: /Lavacar BeloAuto/ }));

    expect(screen.queryByTestId('page-feedback')).not.toBeInTheDocument();
    expect(push).toHaveBeenCalledWith('/dashboard');
  });
});
