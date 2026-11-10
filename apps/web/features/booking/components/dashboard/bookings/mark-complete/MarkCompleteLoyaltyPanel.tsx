'use client';

import { Label } from '@/shared/components/ui/label';
import { NumberInput } from '@/shared/components/ui/number-input';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { LabeledSection } from '@/shared/components/ui/labeled-section';

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
  const tUnits = useTranslations('common.units');
  const { formatMoney } = useFormatting();

  return (
    <LabeledSection title={t('loyaltySection')} labelTestId="complete-loyalty-section-title">
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
            <div className="min-w-0 flex-1">
              <Label
                htmlFor="complete-points-used"
                className="mb-2 text-xs uppercase tracking-[0.07em] text-gray-400"
              >
                {t('loyaltyPointsLabel')}
              </Label>
              <NumberInput
                id="complete-points-used"
                unit={tUnits('points')}
                min="0"
                max={maxRedeemablePoints}
                step={loyaltyPointsPerCurrencyUnit}
                value={pointsUsed}
                onChange={(event) => onPointsChange(event.target.value)}
                className="font-semibold"
              />
            </div>
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
    </LabeledSection>
  );
}
