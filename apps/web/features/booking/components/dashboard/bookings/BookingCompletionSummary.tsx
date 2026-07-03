'use client';

import { useTranslations } from 'next-intl';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';

interface BookingCompletionSummaryLine {
  readonly lineId: string;
  readonly serviceName: string;
  readonly quotedPrice: number;
  readonly chargedPrice: number;
}

interface BookingCompletionSummaryDiscount {
  readonly pointsUsed: number;
  readonly amount: number;
}

interface BookingCompletionSummaryProps {
  readonly quotedTotal: number;
  readonly chargedTotal: number;
  readonly lines: readonly BookingCompletionSummaryLine[];
  readonly discount: BookingCompletionSummaryDiscount | null;
  readonly pointsEarned: number | null;
}

export function BookingCompletionSummary({
  quotedTotal,
  chargedTotal,
  lines,
  discount,
  pointsEarned,
}: BookingCompletionSummaryProps): React.JSX.Element {
  const t = useTranslations('dashboard.bookingDetail');
  const { formatMoney } = useFormatting();

  return (
    <>
      <p>{t('completedBody')}</p>
      <p className="mt-2">{t('summaryQuoted', { total: formatMoney(quotedTotal) })}</p>
      <p className="mt-2">{t('summaryCharged', { total: formatMoney(chargedTotal) })}</p>
      {discount && (
        <p data-testid="complete-loyalty-discount-applied" className="mt-2">
          {t('loyaltyDiscountSummary', { amount: formatMoney(discount.amount) })}
        </p>
      )}
      <div className="mt-3 space-y-2 border-t border-green-100 pt-3">
        {lines.map((line) => (
          <div
            key={line.lineId}
            className="flex items-center justify-between gap-3 text-sm text-green-700/90"
          >
            <span className="min-w-0 truncate font-medium">{line.serviceName}</span>
            <span className="text-right">
              {t('quotedPriceLabel', { price: formatMoney(line.quotedPrice) })}{' '}
              <span className="opacity-70">→</span> {t('chargedPriceLabel')}{' '}
              {formatMoney(line.chargedPrice)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-lg bg-green-50/70 px-3 py-2 text-sm text-green-800">
        {pointsEarned !== null && (
          <p className="font-semibold">{t('completedPointsEarned', { count: pointsEarned })}</p>
        )}
        <p data-testid="complete-email-summary" className="mt-1">
          {t('completedEmailSummary')}
        </p>
      </div>
    </>
  );
}
