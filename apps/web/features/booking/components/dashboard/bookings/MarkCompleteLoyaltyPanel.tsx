'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';

interface MarkCompleteLoyaltyPanelProps {
  readonly loyaltyBalance: number;
  readonly loyaltyPointsPerCurrencyUnit: number;
  readonly maxRedeemablePoints: number;
  readonly pointsUsed: number;
  readonly discountAmount: number;
  readonly onPointsChange: (value: string) => void;
  readonly onUseAllPoints: () => void;
}

// Extracted from MarkCompleteBookingPage (TD37-S5A) — the loyalty-redemption panel is a
// self-contained section wired only to points/discount state, unrelated to line pricing.
export function MarkCompleteLoyaltyPanel({
  loyaltyBalance,
  loyaltyPointsPerCurrencyUnit,
  maxRedeemablePoints,
  pointsUsed,
  discountAmount,
  onPointsChange,
  onUseAllPoints,
}: MarkCompleteLoyaltyPanelProps): React.JSX.Element {
  const t = useTranslations('dashboard.bookingDetail');
  const { formatMoney } = useFormatting();

  return (
    <section>
      <p
        data-testid="complete-loyalty-section-title"
        className="mb-2 text-xs font-bold uppercase tracking-[0.07em] text-gray-400"
      >
        {t('loyaltySection')}
      </p>
      <Card className="border-blue-200 bg-blue-50/70">
        <CardContent className="space-y-4 p-4">
          <div className="space-y-1">
            <p
              data-testid="complete-loyalty-available-points"
              className="text-sm font-semibold text-gray-900"
            >
              {t('loyaltyAvailablePoints', { count: loyaltyBalance })}
            </p>
            <p data-testid="complete-loyalty-rate-hint" className="text-xs text-gray-600">
              {t('loyaltyRateHint', {
                points: loyaltyPointsPerCurrencyUnit,
                amount: formatMoney(1),
                maxAmount: formatMoney(maxRedeemablePoints / loyaltyPointsPerCurrencyUnit),
              })}
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="block min-w-0 flex-1">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.07em] text-gray-400">
                {t('loyaltyPointsLabel')}
              </span>
              <input
                type="number"
                min="0"
                max={maxRedeemablePoints}
                step={loyaltyPointsPerCurrencyUnit}
                value={pointsUsed}
                onChange={(event) => onPointsChange(event.target.value)}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm font-semibold outline-none ring-0 focus:border-blue-500"
              />
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onUseAllPoints}
              disabled={maxRedeemablePoints <= 0}
              className="shrink-0"
            >
              {t('loyaltyUseAll')}
            </Button>
          </div>

          {pointsUsed > 0 && (
            <div className="border-t border-blue-100 pt-3 text-sm font-semibold text-blue-900">
              {t('loyaltyDiscountSummary', { amount: formatMoney(discountAmount) })}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
