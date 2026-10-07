'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { appendReturnTo } from '../../booking-navigation';

interface RescheduleActionProps {
  readonly tenantSlug: string;
  readonly bookingId: string;
  readonly eligibleUntil: string;
  readonly returnTo?: string | null;
}

export function RescheduleAction({
  tenantSlug,
  bookingId,
  eligibleUntil,
  returnTo = null,
}: RescheduleActionProps): React.JSX.Element {
  const t = useTranslations('customer.bookingDetail');
  const { formatDateLong, formatTime } = useFormatting();
  const deadline = new Date(eligibleUntil);
  const href = appendReturnTo(
    `/${tenantSlug}/my-account/bookings/${bookingId}/reschedule`,
    returnTo,
  );

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-gray-100 bg-white p-4">
      <p className="text-xs text-gray-500">
        {t('rescheduleWindowNote', {
          date: formatDateLong(deadline),
          time: formatTime(deadline),
        })}
      </p>
      <Link
        href={href}
        className="rounded-lg border border-gray-200 px-4 py-2.5 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50"
      >
        {t('rescheduleButton')}
      </Link>
    </div>
  );
}
