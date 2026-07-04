// @vitest-environment jsdom
import { renderWithIntl } from '@/test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { LoyaltySearchPage } from './LoyaltySearchPage';

const searchCustomers = vi.hoisted(() => vi.fn());

vi.mock('@/features/customer/api', () => ({
  searchCustomers,
}));

beforeEach(() => {
  vi.useRealTimers();
  searchCustomers.mockReset();
  searchCustomers.mockImplementation((term?: string) =>
    Promise.resolve(
      term
        ? {
            items: [
              {
                customerId: 'c-2',
                name: 'Maria Costa',
                email: 'maria@example.com',
                currentPoints: 0,
              },
            ],
            total: 1,
          }
        : {
            items: [
              {
                customerId: 'c-1',
                name: 'João Silva',
                email: 'joao@example.com',
                currentPoints: 350,
              },
            ],
            total: 1,
          },
    ),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe('LoyaltySearchPage', () => {
  it('renders recent customers and searches on input change', async () => {
    const user = userEvent.setup();

    renderWithIntl(<LoyaltySearchPage />);

    expect(await screen.findByText('João Silva')).toBeInTheDocument();
    expect(screen.getByText('350 pts')).toBeInTheDocument();
    expect(searchCustomers).toHaveBeenCalledWith(undefined, 5);

    await user.type(screen.getByRole('searchbox'), 'maria');

    expect(await screen.findByText('Maria Costa')).toBeInTheDocument();
    expect(searchCustomers).toHaveBeenCalledWith('maria', 20);
    expect(screen.getByRole('link', { name: /Maria Costa/ })).toHaveAttribute(
      'href',
      '/dashboard/loyalty/c-2',
    );
  });

  it('renders the no-results state when nothing matches', async () => {
    searchCustomers.mockImplementation((term?: string) =>
      Promise.resolve(
        term
          ? { items: [], total: 0 }
          : {
              items: [
                {
                  customerId: 'c-1',
                  name: 'João Silva',
                  email: 'joao@example.com',
                  currentPoints: 350,
                },
              ],
              total: 1,
            },
      ),
    );
    const user = userEvent.setup();

    renderWithIntl(<LoyaltySearchPage />);

    await screen.findByText('João Silva');
    await user.type(screen.getByRole('searchbox'), 'xyz');

    expect(await screen.findByText('Nenhum cliente encontrado')).toBeInTheDocument();
  });
});
