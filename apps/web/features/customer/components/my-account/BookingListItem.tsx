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
import { useCustomerCapabilities } from '../customer-tenant-access-context';
import { BookingStatusIcon } from './BookingStatusIcon';

interface BookingListItemProps {
  readonly item: CustomerBookingListItemDto;
  readonly tenantSlug: string;
}

const OPEN_STATUSES: ReadonlySet<string> = new Set([
  BOOKING_STATUS.APPROVED,
  BOOKING_STATUS.PENDING,
  BOOKING_STATUS.INFO_REQUESTED,
]);

// While the tenant is suspended (UC-121) an open row carries the "Empresa inativa" badge and offers
// no "Responder" (the response is refused); the row still opens the detail and a future booking can
// still be cancelled.
export function BookingListItem({ item, tenantSlug }: BookingListItemProps): React.JSX.Element {
  const t = useTranslations('customer.bookingItem');
  const tInactive = useTranslations('customer.inactiveTenant');
  const { formatMoney, formatTime, formatDateLong } = useFormatting();
  const { showInactiveNotice, canRespondToInfoRequest } = useCustomerCapabilities();

  const statusLabels = buildBookingStatusLabels(t);
  const scheduledAt = new Date(item.scheduledAt);
  const serviceNames = item.lines.map((line) => line.serviceName).join(', ');
  const detailHref = `/${tenantSlug}/my-account/bookings/${item.bookingId}`;
  const cancelHref = `${detailHref}/cancel`;
  const cancellable = canCancelBooking(item);
  const showInactiveBadge = showInactiveNotice && OPEN_STATUSES.has(item.status);

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
          {item.status === BOOKING_STATUS.INFO_REQUESTED && canRespondToInfoRequest && (
            <Link href={detailHref} className="font-medium text-blue-600 hover:underline">
              {t('respond')}
            </Link>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span
          data-testid="booking-status-badge"
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${BOOKING_STATUS_CLASSES[item.status]}`}
        >
          {statusLabels[item.status]}
        </span>
        {showInactiveBadge && (
          <span
            data-testid="booking-inactive-badge"
            className="rounded-full border border-gray-300 bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600"
          >
            {tInactive('badge')}
          </span>
        )}
      </div>
    </li>
  );
}
