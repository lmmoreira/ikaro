// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { useTranslations } from 'next-intl';
import type { LoyaltyEntryItem, PaginatedLoyaltyEntriesResponse } from '@ikaro/types';
import { CustomerLoyaltyEntriesTab } from './CustomerLoyaltyEntriesTab';

// t receives interpolation values; a fake that stringifies key+values keeps assertions readable
// without depending on real translation copy. Cast once here (rather than at each call site) —
// the component only ever calls `t` as a plain function, never its rich/markup/raw/has methods.
function fakeTFn(key: string, values?: Record<string, unknown>): string {
  return values ? `${key}:${JSON.stringify(values)}` : key;
}
const fakeT = fakeTFn as unknown as ReturnType<typeof useTranslations>;

function makeEntry(overrides?: Partial<LoyaltyEntryItem>): LoyaltyEntryItem {
  return {
    id: 'e-1',
    bookingId: 'b-1',
    serviceName: 'Lavagem Simples',
    points: 20,
    earnedAt: '2026-06-10T10:00:00.000Z',
    expiresAt: '2027-06-10T10:00:00.000Z',
    isActive: true,
    ...overrides,
  };
}

function makeEntries(items: LoyaltyEntryItem[], total?: number): PaginatedLoyaltyEntriesResponse {
  return { items, total: total ?? items.length, page: 1, limit: 20 };
}

const baseProps = {
  locale: 'pt-BR',
  formatDateLong: (date: Date) => date.toISOString(),
  isLoadingEntries: false,
  loadMoreEntries: vi.fn(),
  loadMoreEntriesError: null,
  returnToHref: '/dashboard/loyalty',
  t: fakeT,
};

describe('CustomerLoyaltyEntriesTab', () => {
  it('renders the empty state when there are no entries', () => {
    render(<CustomerLoyaltyEntriesTab {...baseProps} entries={makeEntries([])} />);

    expect(screen.getByText('entriesEmptyTitle')).toBeInTheDocument();
    expect(screen.getByText('entriesEmptyBody')).toBeInTheDocument();
  });

  it('renders one row per entry with the service name', () => {
    render(
      <CustomerLoyaltyEntriesTab
        {...baseProps}
        entries={makeEntries([
          makeEntry({ id: 'e-1', serviceName: 'Lavagem Simples' }),
          makeEntry({ id: 'e-2', serviceName: 'Lavagem Completa' }),
        ])}
      />,
    );

    const rows = screen.getAllByTestId('loyalty-entry-service-name');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Lavagem Simples');
    expect(rows[1]).toHaveTextContent('Lavagem Completa');
  });

  it('renders the active badge for an active entry, expired badge for an expired one', () => {
    render(
      <CustomerLoyaltyEntriesTab
        {...baseProps}
        entries={makeEntries([
          makeEntry({ id: 'e-1', isActive: true }),
          makeEntry({ id: 'e-2', isActive: false }),
        ])}
      />,
    );

    expect(screen.getByText('entryActiveBadge')).toBeInTheDocument();
    expect(screen.getByText('entryExpiredBadge')).toBeInTheDocument();
  });

  it('renders a booking link when bookingId is present', () => {
    render(
      <CustomerLoyaltyEntriesTab
        {...baseProps}
        entries={makeEntries([makeEntry({ bookingId: 'b-9' })])}
      />,
    );

    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/dashboard/bookings/b-9?returnTo=%2Fdashboard%2Floyalty',
    );
  });

  it('shows the load-more error message when set', () => {
    render(
      <CustomerLoyaltyEntriesTab
        {...baseProps}
        entries={makeEntries([makeEntry()])}
        loadMoreEntriesError="Falha ao carregar"
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Falha ao carregar');
  });

  it('renders the load-more button when there are more entries than shown, hidden otherwise', () => {
    const { rerender } = render(
      <CustomerLoyaltyEntriesTab {...baseProps} entries={makeEntries([makeEntry()], 5)} />,
    );
    expect(screen.getByText('loadMoreEntries')).toBeInTheDocument();

    rerender(<CustomerLoyaltyEntriesTab {...baseProps} entries={makeEntries([makeEntry()], 1)} />);
    expect(screen.queryByText('loadMoreEntries')).not.toBeInTheDocument();
  });

  it('disables the load-more button while isLoadingEntries is true', () => {
    render(
      <CustomerLoyaltyEntriesTab
        {...baseProps}
        entries={makeEntries([makeEntry()], 5)}
        isLoadingEntries
      />,
    );

    expect(screen.getByRole('button', { name: 'loadMoreEntries' })).toBeDisabled();
  });
});
