// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCustomerTenants, switchTenant } from '@/lib/api/auth';
import { renderWithIntl } from '@/test-utils';
import { SwitchTenantClient } from './SwitchTenantClient';

const push = vi.fn();
const replace = vi.fn();
const back = vi.fn();
const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace, back, refresh }),
}));

vi.mock('@/lib/api/auth', () => ({
  fetchCustomerTenants: vi.fn(),
  switchTenant: vi.fn(),
}));

const CURRENT = { id: 't-1', name: 'Lavacar BH', slug: 'lavacar-bh', loyaltyPoints: 120 };
const OTHER = { id: 't-2', name: 'SuperClean', slug: 'superclean', loyaltyPoints: 8 };

describe('SwitchTenantClient', () => {
  afterEach(() => {
    vi.mocked(fetchCustomerTenants).mockReset();
    vi.mocked(switchTenant).mockReset();
    push.mockReset();
    replace.mockReset();
    back.mockReset();
    refresh.mockReset();
  });

  it('shows a loading skeleton while the tenant list is being fetched', () => {
    vi.mocked(fetchCustomerTenants).mockReturnValue(new Promise(() => {}));

    renderWithIntl(<SwitchTenantClient currentTenantSlug="lavacar-bh" />);

    expect(screen.getByTestId('switch-tenant-loading')).toBeInTheDocument();
  });

  it('shows a fetch-error state when the tenant list fails to load', async () => {
    vi.mocked(fetchCustomerTenants).mockRejectedValue(new Error('network error'));

    renderWithIntl(<SwitchTenantClient currentTenantSlug="lavacar-bh" />);

    expect(await screen.findByTestId('switch-tenant-fetch-error')).toBeInTheDocument();
  });

  it('renders the current tenant marked "Atual" and other tenants as clickable cards', async () => {
    vi.mocked(fetchCustomerTenants).mockResolvedValue([CURRENT, OTHER]);

    renderWithIntl(<SwitchTenantClient currentTenantSlug="lavacar-bh" />);

    const current = await screen.findByTestId('switch-tenant-current');
    expect(current).toHaveTextContent('Lavacar BH');
    expect(current).toHaveTextContent('Atual');
    expect(current).toHaveTextContent('120 pontos ativos');

    const option = screen.getByTestId('switch-tenant-option');
    expect(option).toHaveTextContent('SuperClean');
    expect(option).toHaveTextContent('8 pontos ativos');
  });

  it('redirects to the current tenant when the customer has only one tenant', async () => {
    vi.mocked(fetchCustomerTenants).mockResolvedValue([CURRENT]);

    renderWithIntl(<SwitchTenantClient currentTenantSlug="lavacar-bh" />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/lavacar-bh'));
  });

  it('switches tenant on click and redirects to the new tenant slug', async () => {
    vi.mocked(fetchCustomerTenants).mockResolvedValue([CURRENT, OTHER]);
    vi.mocked(switchTenant).mockResolvedValue({ tenantSlug: 'superclean', expiresIn: '7d' });

    renderWithIntl(<SwitchTenantClient currentTenantSlug="lavacar-bh" />);
    await screen.findByTestId('switch-tenant-option');

    await userEvent.click(screen.getByTestId('switch-tenant-option'));

    await waitFor(() => expect(switchTenant).toHaveBeenCalledWith('t-2'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/superclean'));
  });

  it('shows an inline error and does not navigate when the switch fails', async () => {
    vi.mocked(fetchCustomerTenants).mockResolvedValue([CURRENT, OTHER]);
    vi.mocked(switchTenant).mockRejectedValue(new Error('switch failed'));

    renderWithIntl(<SwitchTenantClient currentTenantSlug="lavacar-bh" />);
    await screen.findByTestId('switch-tenant-option');

    await userEvent.click(screen.getByTestId('switch-tenant-option'));

    expect(await screen.findByTestId('switch-tenant-error')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByTestId('switch-tenant-list')).toBeInTheDocument();
  });

  it('hard-navigates to the current tenant\'s hotsite (not router.back()) when "Voltar sem trocar" is clicked', async () => {
    vi.mocked(fetchCustomerTenants).mockResolvedValue([CURRENT, OTHER]);
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, href: '' },
      writable: true,
    });

    renderWithIntl(<SwitchTenantClient currentTenantSlug="lavacar-bh" />);
    await screen.findByTestId('switch-tenant-list');

    await userEvent.click(screen.getByTestId('switch-tenant-cancel'));

    expect(window.location.href).toBe('/lavacar-bh');
    expect(back).not.toHaveBeenCalled();
    expect(switchTenant).not.toHaveBeenCalled();

    Object.defineProperty(window, 'location', { value: originalLocation, writable: true });
  });

  it('falls back to router.back() when there is no current tenant slug', async () => {
    vi.mocked(fetchCustomerTenants).mockResolvedValue([CURRENT, OTHER]);

    renderWithIntl(<SwitchTenantClient currentTenantSlug={null} />);
    await screen.findByTestId('switch-tenant-list');

    await userEvent.click(screen.getByTestId('switch-tenant-cancel'));

    expect(back).toHaveBeenCalled();
  });
});
