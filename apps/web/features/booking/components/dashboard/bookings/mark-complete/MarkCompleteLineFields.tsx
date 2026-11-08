'use client';

import { Input } from '@/shared/components/ui/input';
import { useTranslations } from 'next-intl';
import type { StaffBookingDetailResponse } from '@ikaro/types';
import { Card, CardContent } from '@/shared/components/ui/card';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { LabeledSection } from '@/shared/components/ui/labeled-section';

interface MarkCompleteLineFieldsProps {
  readonly lines: StaffBookingDetailResponse['lines'];
  readonly linePrices: Record<string, string>;
  readonly onLinePriceChange: (lineId: string, value: string) => void;
}

// Extracted from MarkCompleteBookingPage (TD37-S5A) — per-line actual-price entry is a
// self-contained section, unrelated to loyalty redemption or the summary card.
export function MarkCompleteLineFields({
  lines,
  linePrices,
  onLinePriceChange,
}: MarkCompleteLineFieldsProps): React.JSX.Element {
  const t = useTranslations('dashboard.bookingDetail');
  const { formatMoney } = useFormatting();

  return (
    <LabeledSection title={t('completeLinesSection')}>
      <Card>
        <CardContent className="space-y-0 p-0">
          {lines.map((line) => (
            <div
              key={line.lineId}
              className="grid gap-3 border-t border-gray-100 px-4 py-4 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_11rem]"
            >
              <div className="min-w-0">
                <p
                  data-testid="complete-line-name"
                  className="truncate text-sm font-semibold text-gray-900"
                >
                  {line.serviceName}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {t('quotedPriceLabel', {
                    price: formatMoney(line.priceAtBooking.amount),
                  })}
                </p>
              </div>
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.07em] text-gray-400">
                  {t('chargedPriceLabel')}
                </span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={linePrices[line.lineId] ?? ''}
                  onChange={(event) => onLinePriceChange(line.lineId, event.target.value)}
                  className="font-semibold"
                />
              </label>
            </div>
          ))}
        </CardContent>
      </Card>
    </LabeledSection>
  );
}
