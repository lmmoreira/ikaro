// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CustomerLoyaltyEntriesResponse, CustomerLoyaltyEntryResponse } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { LoyaltyEntriesPanel } from './LoyaltyEntriesPanel';

function makeEntry(
  overrides?: Partial<CustomerLoyaltyEntryResponse>,
): CustomerLoyaltyEntryResponse {
  return {
    entryId: 'e-1',
    bookingId: 'b-1',
    serviceName: 'Lavagem Simples',
    pointsEarned: 20,
    earnedAt: '2026-06-10T10:00:00.000Z',
    expiresAt: '2027-06-10T10:00:00.000Z',
    expired: false,
    ...overrides,
  };
}

function makeEntries(items: CustomerLoyaltyEntryResponse[]): CustomerLoyaltyEntriesResponse {
  return { items, total: items.length, page: 1, limit: 20 };
}

describe('LoyaltyEntriesPanel', () => {
  it('renders one row per entry with the service name and points earned', () => {
    renderWithIntl(
      <LoyaltyEntriesPanel entries={makeEntries([makeEntry()])} tenantSlug="lavacar-bh" />,
    );

    expect(screen.getByText('Lavagem Simples')).toBeInTheDocument();
    expect(screen.getByText('+20 pts')).toBeInTheDocument();
  });

  it('links each row to the booking detail page with a returnTo back to the loyalty page', () => {
    renderWithIntl(
      <LoyaltyEntriesPanel entries={makeEntries([makeEntry()])} tenantSlug="lavacar-bh" />,
    );

    expect(screen.getByTestId('loyalty-entry-row')).toHaveAttribute(
      'href',
      `/lavacar-bh/my-account/bookings/b-1?returnTo=${encodeURIComponent('/lavacar-bh/my-account/loyalty')}`,
    );
  });

  it('renders no expired badge for a non-expired entry', () => {
    renderWithIntl(
      <LoyaltyEntriesPanel
        entries={makeEntries([makeEntry({ expired: false })])}
        tenantSlug="lavacar-bh"
      />,
    );

    expect(screen.queryByText('expiredBadge')).not.toBeInTheDocument();
  });

  it('renders multiple rows for multiple entries', () => {
    renderWithIntl(
      <LoyaltyEntriesPanel
        entries={makeEntries([
          makeEntry({ entryId: 'e-1', serviceName: 'Lavagem Simples' }),
          makeEntry({ entryId: 'e-2', serviceName: 'Lavagem Completa' }),
        ])}
        tenantSlug="lavacar-bh"
      />,
    );

    expect(screen.getAllByTestId('loyalty-entry-row')).toHaveLength(2);
  });

  it('renders as an empty list with no rows when there are no entries', () => {
    renderWithIntl(<LoyaltyEntriesPanel entries={makeEntries([])} tenantSlug="lavacar-bh" />);

    expect(screen.queryByTestId('loyalty-entry-row')).not.toBeInTheDocument();
    expect(screen.getByRole('tabpanel')).toBeInTheDocument();
  });
});
