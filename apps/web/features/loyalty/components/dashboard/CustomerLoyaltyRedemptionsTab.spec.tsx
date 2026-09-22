// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { useTranslations } from 'next-intl';
import type { LoyaltyRedemptionItem, PaginatedLoyaltyRedemptionsResponse } from '@ikaro/types';
import { CustomerLoyaltyRedemptionsTab } from './CustomerLoyaltyRedemptionsTab';

function fakeTFn(key: string, values?: Record<string, unknown>): string {
  return values ? `${key}:${JSON.stringify(values)}` : key;
}
const fakeT = fakeTFn as unknown as ReturnType<typeof useTranslations>;

function makeRedemption(overrides?: Partial<LoyaltyRedemptionItem>): LoyaltyRedemptionItem {
  return {
    id: 'r-1',
    pointsRedeemed: 100,
    amountDeducted: 8.5,
    redeemedAt: '2026-06-10T10:00:00.000Z',
    bookingId: 'b-1',
    notes: null,
    ...overrides,
  };
}

function makeRedemptions(
  items: LoyaltyRedemptionItem[],
  total?: number,
): PaginatedLoyaltyRedemptionsResponse {
  return { items, total: total ?? items.length, page: 1, limit: 20 };
}

const baseProps = {
  formatDateLong: (date: Date) => date.toISOString(),
  isLoadingRedemptions: false,
  loadMoreRedemptions: vi.fn(),
  loadMoreRedemptionsError: null,
  returnToHref: '/dashboard/loyalty',
  t: fakeT,
};

describe('CustomerLoyaltyRedemptionsTab', () => {
  it('renders the empty state when there are no redemptions', () => {
    render(<CustomerLoyaltyRedemptionsTab {...baseProps} redemptions={makeRedemptions([])} />);

    expect(screen.getByText('redemptionsEmptyTitle')).toBeInTheDocument();
    expect(screen.getByText('redemptionsEmptyBody')).toBeInTheDocument();
  });

  it('renders the note as the title when present', () => {
    render(
      <CustomerLoyaltyRedemptionsTab
        {...baseProps}
        redemptions={makeRedemptions([makeRedemption({ notes: 'Desconto aniversário' })])}
      />,
    );

    expect(screen.getByTestId('loyalty-redemption-title')).toHaveTextContent(
      'Desconto aniversário',
    );
  });

  it('renders the default title when notes is null or blank', () => {
    render(
      <CustomerLoyaltyRedemptionsTab
        {...baseProps}
        redemptions={makeRedemptions([makeRedemption({ notes: '  ' })])}
      />,
    );

    expect(screen.getByTestId('loyalty-redemption-title')).toHaveTextContent(
      'redemptionDefaultTitle',
    );
  });

  it('renders a booking link when bookingId is present, none when null', () => {
    const { rerender } = render(
      <CustomerLoyaltyRedemptionsTab
        {...baseProps}
        redemptions={makeRedemptions([makeRedemption({ bookingId: 'b-9' })])}
      />,
    );
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/dashboard/bookings/b-9?returnTo=%2Fdashboard%2Floyalty',
    );

    rerender(
      <CustomerLoyaltyRedemptionsTab
        {...baseProps}
        redemptions={makeRedemptions([makeRedemption({ bookingId: null })])}
      />,
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('shows the load-more error message when set', () => {
    render(
      <CustomerLoyaltyRedemptionsTab
        {...baseProps}
        redemptions={makeRedemptions([makeRedemption()])}
        loadMoreRedemptionsError="Falha ao carregar"
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Falha ao carregar');
  });

  it('renders the load-more button only when there are more redemptions than shown', () => {
    const { rerender } = render(
      <CustomerLoyaltyRedemptionsTab
        {...baseProps}
        redemptions={makeRedemptions([makeRedemption()], 5)}
      />,
    );
    expect(screen.getByText('loadMoreRedemptions')).toBeInTheDocument();

    rerender(
      <CustomerLoyaltyRedemptionsTab
        {...baseProps}
        redemptions={makeRedemptions([makeRedemption()], 1)}
      />,
    );
    expect(screen.queryByText('loadMoreRedemptions')).not.toBeInTheDocument();
  });

  it('disables the load-more button while isLoadingRedemptions is true', () => {
    render(
      <CustomerLoyaltyRedemptionsTab
        {...baseProps}
        redemptions={makeRedemptions([makeRedemption()], 5)}
        isLoadingRedemptions
      />,
    );

    expect(screen.getByRole('button', { name: 'loadMoreRedemptions' })).toBeDisabled();
  });
});
