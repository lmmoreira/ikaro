'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import {
  useDescribeBookingWindow,
  type BookingWindowFacts,
} from '../../hooks/useDescribeBookingWindow';

interface RescheduleActionPaneProps {
  readonly from: BookingWindowFacts;
  readonly to: BookingWindowFacts | null;
  readonly eligibleUntil: Date;
  readonly isSubmitting: boolean;
  readonly backHref: string;
  readonly onConfirm: () => void;
}

export function RescheduleActionPane({
  from,
  to,
  eligibleUntil,
  isSubmitting,
  backHref,
  onConfirm,
}: RescheduleActionPaneProps): React.JSX.Element {
  const t = useTranslations('customer.reschedule');
  const { formatDateLong, formatTime } = useFormatting();
  const describe = useDescribeBookingWindow();

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-gray-100 bg-white p-4">
      <p className="mb-1 text-sm leading-relaxed text-gray-500">{t('sidebarNote')}</p>
      {to !== null && (
        <div
          data-testid="reschedule-change-summary"
          className="mb-1 rounded-lg bg-blue-50 px-3.5 py-3 text-sm leading-relaxed text-gray-800"
        >
          <p className="mb-1 font-bold">{t('summaryTitle')}</p>
          <p>{t('summaryFrom', { when: describe(from) })}</p>
          <p className="font-semibold">{t('summaryTo', { when: describe(to) })}</p>
        </div>
      )}
      <button
        type="button"
        onClick={onConfirm}
        disabled={to === null || isSubmitting}
        className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {isSubmitting ? t('confirming') : t('confirmButton')}
      </button>
      <Link
        href={backHref}
        className="rounded-lg border border-gray-200 px-4 py-2.5 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50"
      >
        {t('backButton')}
      </Link>
      <p className="mt-1 text-center text-xs text-gray-500">
        {t('deadlineNote', {
          date: formatDateLong(eligibleUntil),
          time: formatTime(eligibleUntil),
        })}
      </p>
    </div>
  );
}
