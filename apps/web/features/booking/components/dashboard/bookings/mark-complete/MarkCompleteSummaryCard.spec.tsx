// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { MarkCompleteSummaryCard } from './MarkCompleteSummaryCard';

const SCHEDULED_AT = new Date('2026-06-16T10:00:00.000Z');
const SCHEDULED_END = new Date('2026-06-16T10:50:00.000Z');

describe('MarkCompleteSummaryCard', () => {
  it('shows the quoted and charged totals', () => {
    renderWithIntl(
      <MarkCompleteSummaryCard
        scheduledAt={SCHEDULED_AT}
        scheduledEnd={SCHEDULED_END}
        totalDurationMins={50}
        quotedTotal={100}
        chargedTotal={76}
        hasCustomer
        totalEarnedPoints={8}
        showLoyaltyPanel
        pointsUsed={240}
        discountAmount={24}
      />,
    );

    expect(screen.getByTestId('complete-summary-quoted')).toHaveTextContent('R$ 100,00');
    expect(screen.getByTestId('complete-summary-charged')).toHaveTextContent('R$ 76,00');
  });

  it('shows the points-earned line only when hasCustomer is true', () => {
    const { rerender } = renderWithIntl(
      <MarkCompleteSummaryCard
        scheduledAt={SCHEDULED_AT}
        scheduledEnd={SCHEDULED_END}
        totalDurationMins={50}
        quotedTotal={100}
        chargedTotal={100}
        hasCustomer={false}
        totalEarnedPoints={8}
        showLoyaltyPanel={false}
        pointsUsed={0}
        discountAmount={0}
      />,
    );

    expect(screen.queryByTestId('complete-summary-points-earned')).not.toBeInTheDocument();

    rerender(
      <MarkCompleteSummaryCard
        scheduledAt={SCHEDULED_AT}
        scheduledEnd={SCHEDULED_END}
        totalDurationMins={50}
        quotedTotal={100}
        chargedTotal={100}
        hasCustomer
        totalEarnedPoints={8}
        showLoyaltyPanel={false}
        pointsUsed={0}
        discountAmount={0}
      />,
    );

    expect(screen.getByTestId('complete-summary-points-earned')).toHaveTextContent('8');
  });

  it('shows the discount line only when showLoyaltyPanel and pointsUsed are both set', () => {
    renderWithIntl(
      <MarkCompleteSummaryCard
        scheduledAt={SCHEDULED_AT}
        scheduledEnd={SCHEDULED_END}
        totalDurationMins={50}
        quotedTotal={100}
        chargedTotal={76}
        hasCustomer
        totalEarnedPoints={8}
        showLoyaltyPanel
        pointsUsed={240}
        discountAmount={24}
      />,
    );

    expect(screen.getByText('Desconto fidelidade: -R$ 24,00')).toBeInTheDocument();
  });
});
