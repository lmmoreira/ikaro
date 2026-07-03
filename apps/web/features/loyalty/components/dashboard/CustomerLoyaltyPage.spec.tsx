// @vitest-environment jsdom
import { renderWithIntl } from '@/test-utils';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomerLoyaltyPage } from './CustomerLoyaltyPage';

const setBackHrefOverride = vi.hoisted(() => vi.fn());
const setBackLabelOverride = vi.hoisted(() => vi.fn());
const setPageTitleOverride = vi.hoisted(() => vi.fn());
const getCustomerLoyaltyEntries = vi.hoisted(() => vi.fn());
const getCustomerLoyaltyRedemptions = vi.hoisted(() => vi.fn());

vi.mock('@/shells/dashboard/components/topbar-status-context', () => ({
  useDashboardTopbarStatus: () => ({
    setBackHrefOverride,
    setBackLabelOverride,
    setPageTitleOverride,
  }),
}));

vi.mock('@/features/loyalty/dashboard-api', () => ({
  getCustomerLoyaltyEntries,
  getCustomerLoyaltyRedemptions,
}));

const customer = {
  customerId: 'c-1',
  email: 'joao@example.com',
  name: 'João Silva',
  phone: null,
  defaultAddress: null,
};

const balance = {
  currentPoints: 350,
  nextExpiryDate: '2026-12-12T00:00:00.000Z',
  nextExpiryPoints: 180,
  conversionRate: 10,
};

const entries = {
  items: [
    {
      id: 'e-1',
      serviceName: 'Lavagem Simples',
      points: 60,
      earnedAt: '2026-06-10T00:00:00.000Z',
      expiresAt: '2026-12-07T00:00:00.000Z',
      isActive: true,
    },
  ],
  total: 2,
  page: 1,
  limit: 20,
};

const entriesNextPage = {
  ...entries,
  items: [
    ...entries.items,
    {
      id: 'e-2',
      serviceName: 'Lavagem Completa',
      points: 120,
      earnedAt: '2026-05-22T00:00:00.000Z',
      expiresAt: '2026-11-18T00:00:00.000Z',
      isActive: true,
    },
  ],
  limit: 40,
};

const redemptions = {
  items: [
    {
      id: 'r-1',
      pointsRedeemed: 200,
      amountDeducted: 20,
      redeemedAt: '2026-05-22T00:00:00.000Z',
      bookingId: 'booking-1',
      notes: 'Resgate no agendamento',
    },
  ],
  total: 1,
  page: 1,
  limit: 20,
};

beforeEach(() => {
  setBackHrefOverride.mockReset();
  setBackLabelOverride.mockReset();
  setPageTitleOverride.mockReset();
  getCustomerLoyaltyEntries.mockReset();
  getCustomerLoyaltyRedemptions.mockReset();
  getCustomerLoyaltyEntries.mockResolvedValue(entriesNextPage);
  getCustomerLoyaltyRedemptions.mockResolvedValue(redemptions);
});

describe('CustomerLoyaltyPage', () => {
  it('renders the customer loyalty overview and updates the topbar overrides', async () => {
    const user = userEvent.setup();

    renderWithIntl(
      <CustomerLoyaltyPage
        customer={customer}
        balance={balance}
        entries={entries}
        redemptions={redemptions}
      />,
    );

    expect(screen.getByText('João Silva')).toBeInTheDocument();
    expect(screen.getByText('joao@example.com')).toBeInTheDocument();
    expect(screen.getByText('350')).toBeInTheDocument();
    expect(screen.getByText('Lavagem Simples')).toBeInTheDocument();

    await waitFor(() => expect(setBackHrefOverride).toHaveBeenCalledWith('/dashboard/loyalty'));
    expect(setBackLabelOverride).toHaveBeenCalledWith('Fidelidade');
    expect(setPageTitleOverride).toHaveBeenCalledWith('João Silva');

    await user.click(screen.getByRole('button', { name: 'Resgates' }));
    expect(screen.getByText('Resgate no agendamento')).toBeInTheDocument();
  });

  it('loads more entries when the button is clicked', async () => {
    const user = userEvent.setup();

    renderWithIntl(
      <CustomerLoyaltyPage
        customer={customer}
        balance={balance}
        entries={entries}
        redemptions={redemptions}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Carregar mais entradas' }));

    await waitFor(() =>
      expect(getCustomerLoyaltyEntries).toHaveBeenCalledWith('c-1', {
        page: 1,
        limit: 40,
      }),
    );
    expect(await screen.findByText('Lavagem Completa')).toBeInTheDocument();
  });

  it('links redemption rows back to the redemptions tab on booking detail return', async () => {
    renderWithIntl(
      <CustomerLoyaltyPage
        customer={customer}
        balance={balance}
        entries={entries}
        redemptions={redemptions}
        initialActiveTab="redemptions"
      />,
    );

    const bookingLink = await screen.findByRole('link', { name: 'Agendamento booking-' });
    expect(bookingLink).toHaveAttribute(
      'href',
      '/dashboard/bookings/booking-1?returnTo=%2Fdashboard%2Floyalty%2Fc-1%3Ftab%3Dredemptions',
    );
  });
});
