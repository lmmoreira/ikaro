'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { CustomerBookingListItem as CustomerBookingListItemDto } from '@ikaro/types';
import { BOOKING_STATUS } from '@ikaro/types';
import {
  BOOKING_STATUS_CLASSES,
  buildBookingStatusLabels,
} from '@/features/booking/model/booking-status';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { canCancelBooking } from '../../booking-sections';
import { BookingStatusIcon } from './BookingStatusIcon';

interface BookingListItemProps {
  readonly item: CustomerBookingListItemDto;
  readonly tenantSlug: string;
}

export function BookingListItem({ item, tenantSlug }: BookingListItemProps): React.JSX.Element {
  const t = useTranslations('customer.bookingItem');
  const { formatMoney, formatTime, formatDateLong } = useFormatting();

  const statusLabels = buildBookingStatusLabels(t);
  const scheduledAt = new Date(item.scheduledAt);
  const serviceNames = item.lines.map((line) => line.serviceName).join(', ');
  const detailHref = `/${tenantSlug}/my-account/bookings/${item.bookingId}`;
  const cancelHref = `${detailHref}/cancel`;
  const cancellable = canCancelBooking(item);

  return (
    <li className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <BookingStatusIcon status={item.status} />
      <div className="min-w-0 flex-1">
        <Link
          href={detailHref}
          className="block truncate text-sm font-semibold text-gray-900 hover:underline"
        >
          {serviceNames}
        </Link>
        <p className="mt-0.5 text-xs text-gray-500">
          {formatDateLong(scheduledAt)} · {formatTime(scheduledAt)} ·{' '}
          {formatMoney(item.totalPrice.amount)}
        </p>
        {item.status === BOOKING_STATUS.INFO_REQUESTED && (
          <p className="mt-0.5 text-xs font-medium text-blue-600">{t('infoNeeded')}</p>
        )}
        <div className="mt-1.5 flex items-center gap-3 text-xs">
          {item.status === BOOKING_STATUS.APPROVED && cancellable && (
            <Link href={cancelHref} className="font-medium text-red-600 hover:underline">
              {t('cancel')}
            </Link>
          )}
          {item.status === BOOKING_STATUS.APPROVED && !cancellable && (
            <span data-testid="booking-window-closed-note" className="text-gray-400">
              {t('windowClosed')}
            </span>
          )}
          {item.status === BOOKING_STATUS.PENDING && (
            <Link href={cancelHref} className="font-medium text-red-600 hover:underline">
              {t('cancelRequest')}
            </Link>
          )}
          {item.status === BOOKING_STATUS.INFO_REQUESTED && (
            <Link href={detailHref} className="font-medium text-blue-600 hover:underline">
              {t('respond')}
            </Link>
          )}
        </div>
      </div>
      <span
        data-testid="booking-status-badge"
        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${BOOKING_STATUS_CLASSES[item.status]}`}
      >
        {statusLabels[item.status]}
      </span>
    </li>
  );
}
