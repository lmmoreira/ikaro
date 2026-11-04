// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { useTranslations } from 'next-intl';
import type { CustomerSearchItem } from '@ikaro/types';
import { LoyaltySearchResults } from './LoyaltySearchResults';

function fakeTFn(key: string): string {
  return key;
}
const fakeT = fakeTFn as unknown as ReturnType<typeof useTranslations>;

function makeCustomer(overrides?: Partial<CustomerSearchItem>): CustomerSearchItem {
  return {
    customerId: 'c-1',
    name: 'João Silva',
    email: 'joao@example.com',
    phone: '+5531999999999',
    currentPoints: 120,
    ...overrides,
  };
}

const pointsBadge = (count: number): string => `${count} pts`;

describe('LoyaltySearchResults', () => {
  it('renders a loading skeleton when isLoading is true', () => {
    const { container } = render(
      <LoyaltySearchResults
        customers={[]}
        isLoading
        isError={false}
        errorMessage={null}
        onRetry={vi.fn()}
        retryLabel="Tentar novamente"
        isRecent={false}
        pointsBadge={pointsBadge}
        t={fakeT}
      />,
    );

    expect(
      container.querySelectorAll('.animate-pulse, [class*="bg-gray-100"]').length,
    ).toBeGreaterThan(0);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders the search failure as a page-level message with a retry, not the empty state', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <LoyaltySearchResults
        customers={[]}
        isLoading={false}
        isError
        errorMessage="Falha ao buscar"
        onRetry={onRetry}
        retryLabel="Tentar novamente"
        isRecent={false}
        pointsBadge={pointsBadge}
        t={fakeT}
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('data-testid', 'page-feedback');
    expect(alert).toHaveTextContent('searchErrorTitle');
    expect(alert).toHaveTextContent('Falha ao buscar');
    expect(screen.queryByText('noResultsTitle')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('renders a row per customer with name, email, and points badge when customers is non-empty', () => {
    render(
      <LoyaltySearchResults
        customers={[
          makeCustomer({ customerId: 'c-1', name: 'João Silva', currentPoints: 120 }),
          makeCustomer({ customerId: 'c-2', name: 'Maria Souza', currentPoints: 40 }),
        ]}
        isLoading={false}
        isError={false}
        errorMessage={null}
        onRetry={vi.fn()}
        retryLabel="Tentar novamente"
        isRecent={false}
        pointsBadge={pointsBadge}
        t={fakeT}
      />,
    );

    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(screen.getByText('João Silva')).toBeInTheDocument();
    expect(screen.getByText('Maria Souza')).toBeInTheDocument();
    expect(screen.getByText('120 pts')).toBeInTheDocument();
    expect(screen.getByText('40 pts')).toBeInTheDocument();
  });

  it('links each customer row to their loyalty detail page', () => {
    render(
      <LoyaltySearchResults
        customers={[makeCustomer({ customerId: 'c-42' })]}
        isLoading={false}
        isError={false}
        errorMessage={null}
        onRetry={vi.fn()}
        retryLabel="Tentar novamente"
        isRecent={false}
        pointsBadge={pointsBadge}
        t={fakeT}
      />,
    );

    expect(screen.getByRole('link')).toHaveAttribute('href', '/dashboard/loyalty/c-42');
  });

  it('renders the recent-empty state when no customers and isRecent is true', () => {
    render(
      <LoyaltySearchResults
        customers={[]}
        isLoading={false}
        isError={false}
        errorMessage={null}
        onRetry={vi.fn()}
        retryLabel="Tentar novamente"
        isRecent
        pointsBadge={pointsBadge}
        t={fakeT}
      />,
    );

    expect(screen.getByText('noCustomersTitle')).toBeInTheDocument();
    expect(screen.getByText('noCustomersBody')).toBeInTheDocument();
  });

  it('renders the no-results state when no customers and isRecent is false', () => {
    render(
      <LoyaltySearchResults
        customers={[]}
        isLoading={false}
        isError={false}
        errorMessage={null}
        onRetry={vi.fn()}
        retryLabel="Tentar novamente"
        isRecent={false}
        pointsBadge={pointsBadge}
        t={fakeT}
      />,
    );

    expect(screen.getByText('noResultsTitle')).toBeInTheDocument();
    expect(screen.getByText('noResultsBody')).toBeInTheDocument();
  });
});
