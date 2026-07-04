'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { BOOKING_STATUS, type BookingStatus } from '@ikaro/types';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';

interface CancelActionProps {
  readonly tenantSlug: string;
  readonly bookingId: string;
  readonly status: BookingStatus;
  readonly cancellableUntil: string | null;
}

export function CancelAction({
  tenantSlug,
  bookingId,
  status,
  cancellableUntil,
}: CancelActionProps): React.JSX.Element {
  const t = useTranslations('customer.bookingDetail');
  const { formatDateLong, formatTime } = useFormatting();
  const cancelHref = `/${tenantSlug}/my-account/bookings/${bookingId}/cancel`;
  const isApproved = status === BOOKING_STATUS.APPROVED;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-gray-100 bg-white p-4">
      {isApproved && cancellableUntil !== null && (
        <p className="text-xs text-gray-500">
          {t('cancelWindowNote', {
            date: formatDateLong(new Date(cancellableUntil)),
            time: formatTime(new Date(cancellableUntil)),
          })}
        </p>
      )}
      <Link
        href={cancelHref}
        className="rounded-lg border border-red-200 px-4 py-2.5 text-center text-sm font-semibold text-red-600 hover:bg-red-50"
      >
        {isApproved ? t('cancelButton') : t('cancelRequestButton')}
      </Link>
    </div>
  );
}
