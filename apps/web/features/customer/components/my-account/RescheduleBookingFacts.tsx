'use client';

import { useTranslations } from 'next-intl';
import { formatDuration } from '@/shared/lib/formatting/format-duration';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';

export interface BookingWindowFacts {
  readonly start: Date;
  readonly end: Date;
}

interface RescheduleBookingFactsProps {
  readonly serviceNames: string;
  readonly when: BookingWindowFacts;
  readonly durationMins: number;
  readonly price: number;
  readonly before?: BookingWindowFacts;
}

interface FactRowProps {
  readonly label: string;
  readonly testId?: string;
  readonly children: React.ReactNode;
}

function FactRow({ label, testId, children }: FactRowProps): React.JSX.Element {
  return (
    <div className="flex justify-between gap-4 border-b border-gray-100 py-2 text-sm last:border-b-0">
      <span className="text-gray-500">{label}</span>
      <span data-testid={testId} className="text-right font-medium text-gray-900">
        {children}
      </span>
    </div>
  );
}

export function RescheduleBookingFacts({
  serviceNames,
  when,
  durationMins,
  price,
  before,
}: RescheduleBookingFactsProps): React.JSX.Element {
  const t = useTranslations('customer.reschedule');
  const { formatDateLong, formatTime, formatMoney } = useFormatting();

  const describe = ({ start, end }: BookingWindowFacts): string =>
    `${formatDateLong(start)} · ${formatTime(start)}–${formatTime(end)}`;

  return (
    <div className="rounded-xl border border-gray-100 bg-white px-4 py-2">
      <FactRow label={t('serviceLabel')}>{serviceNames}</FactRow>
      <FactRow label={t('whenLabel')} testId="reschedule-fact-when">
        {describe(when)}
      </FactRow>
      {before !== undefined && (
        <FactRow label={t('beforeLabel')}>
          <span className="text-gray-500 line-through">{describe(before)}</span>
        </FactRow>
      )}
      <FactRow label={t('durationPriceLabel')}>
        {formatDuration(durationMins)} · {formatMoney(price)}
        {before !== undefined && ` (${t('unchangedNote')})`}
      </FactRow>
    </div>
  );
}
