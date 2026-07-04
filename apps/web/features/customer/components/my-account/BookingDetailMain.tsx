'use client';

import { useTranslations } from 'next-intl';
import type { CustomerBookingDetailResponse } from '@ikaro/types';
import { BOOKING_STATUS } from '@ikaro/types';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';

interface BookingDetailMainProps {
  readonly booking: CustomerBookingDetailResponse;
}

export function BookingDetailMain({ booking }: BookingDetailMainProps): React.JSX.Element {
  const t = useTranslations('customer.bookingDetail');
  const { formatMoney, formatTime, formatDateLong } = useFormatting();

  const isCompleted = booking.status === BOOKING_STATUS.COMPLETED;
  const scheduledAt = booking.scheduledAt !== null ? new Date(booking.scheduledAt) : null;

  return (
    <div className="flex flex-col gap-5">
      {isCompleted && booking.pointsEarned !== null && booking.pointsEarned > 0 && (
        <div className="rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm font-semibold text-green-800">
          {t('pointsEarnedBanner', { points: booking.pointsEarned })}
        </div>
      )}

      <section>
        <h2 className="text-sm font-semibold text-gray-500">{t('dateTimeTitle')}</h2>
        <p className="mt-1 text-base font-medium text-gray-900">
          {scheduledAt !== null ? formatDateLong(scheduledAt) : t('scheduledAtPending')}
        </p>
        {scheduledAt !== null && <p className="text-sm text-gray-500">{formatTime(scheduledAt)}</p>}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-gray-500">{t('servicesTitle')}</h2>
        <table className="mt-2 w-full text-sm">
          <tbody>
            {booking.lines.map((line) => (
              <tr key={line.lineId} className="border-b border-gray-100 last:border-0">
                <td className="py-2 pr-2 font-medium text-gray-900">{line.serviceName}</td>
                <td className="py-2 pr-2 text-gray-500">{line.durationMinsAtBooking} min</td>
                <td className="py-2 text-right font-medium text-gray-900">
                  {isCompleted && line.actualPriceCharged !== null
                    ? formatMoney(line.actualPriceCharged.amount)
                    : formatMoney(line.priceAtBooking.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2 flex items-center justify-between border-t border-gray-200 pt-2 text-sm font-semibold text-gray-900">
          <span>{isCompleted ? t('totalCharged') : t('total')}</span>
          <span>
            {isCompleted && booking.totalActualPrice !== null
              ? formatMoney(booking.totalActualPrice.amount)
              : formatMoney(booking.totalPrice.amount)}
          </span>
        </div>
        {isCompleted && booking.totalActualPrice !== null && (
          <p className="mt-1 text-right text-xs text-gray-400">
            {t('quotedPrice', { amount: formatMoney(booking.totalPrice.amount) })}
          </p>
        )}
        {isCompleted && booking.discountAmount !== null && booking.discountPointsUsed !== null && (
          <p className="mt-1 text-right text-xs text-blue-600">
            {t('discountApplied', {
              points: booking.discountPointsUsed,
              amount: formatMoney(booking.discountAmount.amount),
            })}
          </p>
        )}
      </section>

      {booking.notes !== null && (
        <section>
          <h2 className="text-sm font-semibold text-gray-500">{t('notesTitle')}</h2>
          <p className="mt-1 text-sm text-gray-700">{booking.notes}</p>
        </section>
      )}

      {booking.infoResponseMessage !== null && (
        <section>
          <h2 className="text-sm font-semibold text-gray-500">{t('yourResponseTitle')}</h2>
          <p className="mt-1 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
            {booking.infoResponseMessage}
          </p>
        </section>
      )}

      {booking.beforeServicePhotoUrls.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-500">{t('beforePhotosTitle')}</h2>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {booking.beforeServicePhotoUrls.map((url, index) => (
              <img
                key={`${url}-${index}`}
                src={url}
                alt={t('beforePhotoAlt', { index: index + 1 })}
                loading="lazy"
                className="aspect-square rounded-lg border border-gray-200 object-cover"
              />
            ))}
          </div>
        </section>
      )}

      {isCompleted && booking.afterServicePhotoUrls.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-500">{t('afterPhotosTitle')}</h2>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {booking.afterServicePhotoUrls.map((url, index) => (
              <img
                key={`${url}-${index}`}
                src={url}
                alt={t('afterPhotoAlt', { index: index + 1 })}
                loading="lazy"
                className="aspect-square rounded-lg border border-gray-200 object-cover"
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
