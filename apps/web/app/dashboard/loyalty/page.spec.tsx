// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import LoyaltyRoute from './page';

const LoyaltySearchPage = vi.hoisted(() => vi.fn(() => <div data-testid="loyalty-search-page" />));

vi.mock('@/features/loyalty/components/dashboard/LoyaltySearchPage', () => ({
  LoyaltySearchPage,
}));

describe('LoyaltyRoute', () => {
  it('renders the loyalty search page', () => {
    const element = LoyaltyRoute();
    render(element);

    expect(LoyaltySearchPage).toHaveBeenCalledOnce();
    expect(screen.getByTestId('loyalty-search-page')).toBeInTheDocument();
  });
});
