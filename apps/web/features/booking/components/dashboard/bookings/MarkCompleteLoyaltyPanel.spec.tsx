// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { MarkCompleteLoyaltyPanel } from './MarkCompleteLoyaltyPanel';

describe('MarkCompleteLoyaltyPanel', () => {
  it('renders the available points and rate hint', () => {
    renderWithIntl(
      <MarkCompleteLoyaltyPanel
        loyaltyBalance={240}
        loyaltyPointsPerCurrencyUnit={10}
        maxRedeemablePoints={240}
        pointsUsed={0}
        discountAmount={0}
        onPointsChange={vi.fn()}
        onUseAllPoints={vi.fn()}
      />,
    );

    expect(screen.getByText('Saldo atual: 240 pontos disponíveis')).toBeInTheDocument();
  });

  it('calls onUseAllPoints when the "Usar todos" button is clicked', async () => {
    const user = userEvent.setup();
    const onUseAllPoints = vi.fn();
    renderWithIntl(
      <MarkCompleteLoyaltyPanel
        loyaltyBalance={240}
        loyaltyPointsPerCurrencyUnit={10}
        maxRedeemablePoints={240}
        pointsUsed={0}
        discountAmount={0}
        onPointsChange={vi.fn()}
        onUseAllPoints={onUseAllPoints}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Usar todos' }));

    expect(onUseAllPoints).toHaveBeenCalledTimes(1);
  });

  it('disables the "Usar todos" button when maxRedeemablePoints is 0', () => {
    renderWithIntl(
      <MarkCompleteLoyaltyPanel
        loyaltyBalance={0}
        loyaltyPointsPerCurrencyUnit={10}
        maxRedeemablePoints={0}
        pointsUsed={0}
        discountAmount={0}
        onPointsChange={vi.fn()}
        onUseAllPoints={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Usar todos' })).toBeDisabled();
  });

  it('calls onPointsChange with the raw typed value', async () => {
    const user = userEvent.setup();
    const onPointsChange = vi.fn();
    renderWithIntl(
      <MarkCompleteLoyaltyPanel
        loyaltyBalance={240}
        loyaltyPointsPerCurrencyUnit={10}
        maxRedeemablePoints={240}
        pointsUsed={0}
        discountAmount={0}
        onPointsChange={onPointsChange}
        onUseAllPoints={vi.fn()}
      />,
    );

    await user.type(screen.getByRole('spinbutton', { name: 'Pontos a usar' }), '5');

    expect(onPointsChange).toHaveBeenCalled();
  });

  it('shows the discount summary only when pointsUsed is greater than 0', () => {
    const { rerender } = renderWithIntl(
      <MarkCompleteLoyaltyPanel
        loyaltyBalance={240}
        loyaltyPointsPerCurrencyUnit={10}
        maxRedeemablePoints={240}
        pointsUsed={0}
        discountAmount={0}
        onPointsChange={vi.fn()}
        onUseAllPoints={vi.fn()}
      />,
    );

    expect(screen.queryByText(/Desconto fidelidade/)).not.toBeInTheDocument();

    rerender(
      <MarkCompleteLoyaltyPanel
        loyaltyBalance={240}
        loyaltyPointsPerCurrencyUnit={10}
        maxRedeemablePoints={240}
        pointsUsed={240}
        discountAmount={24}
        onPointsChange={vi.fn()}
        onUseAllPoints={vi.fn()}
      />,
    );

    expect(screen.getByText('Desconto fidelidade: -R$ 24,00')).toBeInTheDocument();
  });
});
