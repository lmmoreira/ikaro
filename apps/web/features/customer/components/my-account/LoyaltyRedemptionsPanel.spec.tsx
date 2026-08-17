// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type {
  CustomerLoyaltyRedemptionResponse,
  CustomerLoyaltyRedemptionsResponse,
} from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { LoyaltyRedemptionsPanel } from './LoyaltyRedemptionsPanel';

function makeRedemption(
  overrides?: Partial<CustomerLoyaltyRedemptionResponse>,
): CustomerLoyaltyRedemptionResponse {
  return {
    redemptionId: 'r-1',
    bookingId: 'b-1',
    pointsUsed: 100,
    amountSaved: 'R$ 8,50',
    redeemedAt: '2026-06-10T10:00:00.000Z',
    bookingReference: '#1234',
    ...overrides,
  };
}

function makeRedemptions(
  items: CustomerLoyaltyRedemptionResponse[],
): CustomerLoyaltyRedemptionsResponse {
  return { items, total: items.length, page: 1, limit: 20 };
}

describe('LoyaltyRedemptionsPanel', () => {
  it('renders the empty-state message when there are no redemptions', () => {
    renderWithIntl(
      <LoyaltyRedemptionsPanel redemptions={makeRedemptions([])} tenantSlug="lavacar-bh" />,
    );

    expect(screen.getByText('Nenhum resgate realizado ainda')).toBeInTheDocument();
    expect(screen.queryByTestId('loyalty-redemption-row')).not.toBeInTheDocument();
  });

  it('renders a row per redemption with points used and savings', () => {
    renderWithIntl(
      <LoyaltyRedemptionsPanel
        redemptions={makeRedemptions([makeRedemption()])}
        tenantSlug="lavacar-bh"
      />,
    );

    expect(screen.getByText('−100 pts')).toBeInTheDocument();
    expect(screen.getByText('Economia: R$ 8,50')).toBeInTheDocument();
  });

  it('renders the booking reference label when present', () => {
    renderWithIntl(
      <LoyaltyRedemptionsPanel
        redemptions={makeRedemptions([makeRedemption({ bookingReference: '#5678' })])}
        tenantSlug="lavacar-bh"
      />,
    );

    expect(screen.getByText('Resgate — #5678')).toBeInTheDocument();
  });

  it('renders the generic label when bookingReference is null', () => {
    renderWithIntl(
      <LoyaltyRedemptionsPanel
        redemptions={makeRedemptions([makeRedemption({ bookingReference: null })])}
        tenantSlug="lavacar-bh"
      />,
    );

    expect(screen.getByText('Resgate')).toBeInTheDocument();
  });

  it('renders the row as a link to the booking when bookingId is present', () => {
    renderWithIntl(
      <LoyaltyRedemptionsPanel
        redemptions={makeRedemptions([makeRedemption({ bookingId: 'b-9' })])}
        tenantSlug="lavacar-bh"
      />,
    );

    expect(screen.getByTestId('loyalty-redemption-row').tagName).toBe('A');
    expect(screen.getByTestId('loyalty-redemption-row')).toHaveAttribute(
      'href',
      `/lavacar-bh/my-account/bookings/b-9?returnTo=${encodeURIComponent('/lavacar-bh/my-account/loyalty')}`,
    );
  });

  it('renders the row as a plain div (not a link) when bookingId is null', () => {
    renderWithIntl(
      <LoyaltyRedemptionsPanel
        redemptions={makeRedemptions([makeRedemption({ bookingId: null })])}
        tenantSlug="lavacar-bh"
      />,
    );

    expect(screen.getByTestId('loyalty-redemption-row').tagName).toBe('DIV');
  });
});
