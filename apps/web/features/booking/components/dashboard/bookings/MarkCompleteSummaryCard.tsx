'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/shared/components/ui/card';
import { formatDuration } from '@/shared/lib/formatting/format-duration';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';

interface MarkCompleteSummaryCardProps {
  readonly scheduledAt: Date;
  readonly scheduledEnd: Date;
  readonly totalDurationMins: number;
  readonly quotedTotal: number;
  readonly chargedTotal: number;
  readonly hasCustomer: boolean;
  readonly totalEarnedPoints: number;
  readonly showLoyaltyPanel: boolean;
  readonly pointsUsed: number;
  readonly discountAmount: number;
}

// Extracted from MarkCompleteBookingPage (TD37-S5A) — the schedule/pricing summary card is a
// self-contained, read-only reflection of the state around it.
export function MarkCompleteSummaryCard({
  scheduledAt,
  scheduledEnd,
  totalDurationMins,
  quotedTotal,
  chargedTotal,
  hasCustomer,
  totalEarnedPoints,
  showLoyaltyPanel,
  pointsUsed,
  discountAmount,
}: MarkCompleteSummaryCardProps): React.JSX.Element {
  const t = useTranslations('dashboard.bookingDetail');
  const { formatMoney, formatDateLong, formatTime } = useFormatting();

  return (
    <section>
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.07em] text-gray-400">
        {t('summaryLabel')}
      </p>
      <Card className="border-blue-200 bg-blue-50/70">
        <CardContent className="space-y-3 p-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.07em] text-blue-700">
              {t('scheduleSection')}
            </p>
            <p className="mt-1 text-sm font-semibold text-gray-900">
              {formatDateLong(scheduledAt)}
            </p>
            <p className="mt-0.5 text-sm text-gray-600">
              {formatTime(scheduledAt)} — {formatTime(scheduledEnd)} (
              {formatDuration(totalDurationMins)})
            </p>
          </div>
          <div className="space-y-2 border-t border-blue-100 pt-3 text-sm text-blue-900">
            <p data-testid="complete-summary-quoted">
              {t('summaryQuoted', { total: formatMoney(quotedTotal) })}
            </p>
            <p data-testid="complete-summary-charged">
              {t('summaryCharged', { total: formatMoney(chargedTotal) })}
            </p>
            {hasCustomer && (
              <p data-testid="complete-summary-points-earned">
                {t('summaryPointsEarned', { count: totalEarnedPoints })}
              </p>
            )}
            {showLoyaltyPanel && pointsUsed > 0 && (
              <p>{t('loyaltyDiscountSummary', { amount: formatMoney(discountAmount) })}</p>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
