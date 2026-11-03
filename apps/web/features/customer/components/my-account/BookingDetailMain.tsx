'use client';

import { useTranslations } from 'next-intl';
import { Calendar, Clock, MessageSquare } from 'lucide-react';
import type { CustomerBookingDetailResponse } from '@ikaro/types';
import { BOOKING_STATUS } from '@ikaro/types';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { PhotoTile } from '@/features/booking/components/PhotoTile';
import { CustomerBookingExtras } from './CustomerBookingExtras';
import { DetailSection } from './DetailSection';

interface BookingDetailMainProps {
  readonly booking: CustomerBookingDetailResponse;
  readonly tenantSlug: string;
}

interface DetailRowProps {
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly value: React.ReactNode;
  readonly last?: boolean;
}

function DetailRow({ icon, label, value, last }: DetailRowProps): React.JSX.Element {
  return (
    <div className={`flex items-start gap-3 py-3 ${last ? '' : 'border-b border-gray-100'}`}>
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50">
        {icon}
      </div>
      <div className="min-w-0">
        {label !== '' && <p className="text-xs text-gray-500">{label}</p>}
        <p className="text-[0.9375rem] font-semibold text-gray-900">{value}</p>
      </div>
    </div>
  );
}

export function BookingDetailMain({
  booking,
  tenantSlug,
}: BookingDetailMainProps): React.JSX.Element {
  const t = useTranslations('customer.bookingDetail');
  const { formatMoney, formatTime, formatDateLong } = useFormatting();

  const isCompleted = booking.status === BOOKING_STATUS.COMPLETED;
  const scheduledAt = booking.scheduledAt === null ? null : new Date(booking.scheduledAt);
  const totalDurationMins = booking.lines.reduce((sum, l) => sum + l.durationMinsAtBooking, 0);
  const iconClass = 'h-3.5 w-3.5 text-blue-600';

  return (
    <div className="flex flex-col gap-5">
      <DetailSection title={t('dateTimeTitle')}>
        <div>
          <DetailRow
            icon={<Calendar className={iconClass} aria-hidden="true" />}
            label={t('dateLabel')}
            value={scheduledAt === null ? t('scheduledAtPending') : formatDateLong(scheduledAt)}
          />
          {scheduledAt !== null && (
            <DetailRow
              icon={<Clock className={iconClass} aria-hidden="true" />}
              label={t('timeLabel')}
              value={
                isCompleted
                  ? formatTime(scheduledAt)
                  : t('timeWithDuration', {
                      time: formatTime(scheduledAt),
                      minutes: totalDurationMins,
                    })
              }
              last
            />
          )}
        </div>
      </DetailSection>

      <DetailSection title={t('servicesTitle')}>
        <div>
          {booking.lines.map((line) => (
            <div
              key={line.lineId}
              className="flex items-start justify-between gap-3 border-b border-gray-100 py-3"
            >
              <div>
                <p className="text-[0.9375rem] font-semibold text-gray-900">{line.serviceName}</p>
                <p className="mt-0.5 text-[0.8125rem] text-gray-500">
                  {t('lineDurationMinutes', { minutes: line.durationMinsAtBooking })}
                </p>
              </div>
              <span className="shrink-0 text-[0.9375rem] font-bold text-gray-900">
                {isCompleted && line.actualPriceCharged !== null
                  ? formatMoney(line.actualPriceCharged.amount)
                  : formatMoney(line.priceAtBooking.amount)}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between border-t-2 border-gray-100 py-3">
            <span className="text-sm font-bold text-gray-500">
              {isCompleted ? t('totalCharged') : t('total')}
            </span>
            <span
              data-testid="booking-total-value"
              className="text-base font-extrabold text-gray-900"
            >
              {isCompleted && booking.totalActualPrice !== null
                ? formatMoney(booking.totalActualPrice.amount)
                : formatMoney(booking.totalPrice.amount)}
            </span>
          </div>
        </div>
      </DetailSection>

      {isCompleted && (
        <DetailSection title={t('summaryLabel')}>
          <div
            data-testid="completion-summary"
            className="mt-2.5 flex flex-col gap-1.5 rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3.5 text-sm text-blue-900"
          >
            <p>{t('quotedPrice', { amount: formatMoney(booking.totalPrice.amount) })}</p>
            <p className="font-semibold">
              {t('totalCharged')}:{' '}
              {formatMoney((booking.totalActualPrice ?? booking.totalPrice).amount)}
            </p>
            {booking.pointsEarned !== null && booking.pointsEarned > 0 && (
              <p data-testid="points-earned-banner">
                {t('pointsEarnedBanner', { points: booking.pointsEarned })}
              </p>
            )}
            {booking.discountAmount !== null && booking.discountPointsUsed !== null && (
              <p>
                {t('discountApplied', {
                  points: booking.discountPointsUsed,
                  amount: formatMoney(booking.discountAmount.amount),
                })}
              </p>
            )}
          </div>
        </DetailSection>
      )}

      <CustomerBookingExtras booking={booking} tenantSlug={tenantSlug} />

      {booking.notes !== null && (
        <DetailSection title={t('notesTitle')}>
          <div>
            <DetailRow
              icon={<MessageSquare className={iconClass} aria-hidden="true" />}
              label=""
              value={<span className="font-normal">{booking.notes}</span>}
              last
            />
          </div>
        </DetailSection>
      )}

      {booking.infoResponseMessage !== null && (
        <DetailSection title={t('yourResponseTitle')}>
          <p className="mt-2 text-sm text-gray-700">{booking.infoResponseMessage}</p>
        </DetailSection>
      )}

      {booking.beforeServicePhotoUrls.length > 0 && (
        <DetailSection title={t('beforePhotosTitle')}>
          <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {booking.beforeServicePhotoUrls.map((url, index) => (
              <PhotoTile
                key={`${url}-${index}`}
                url={url}
                alt={t('beforePhotoAlt', { index: index + 1 })}
                unavailableLabel={t('photoUnavailableLabel')}
                unavailableAlt={t('photoUnavailableAlt')}
                className="aspect-square w-full rounded-lg border border-gray-100 bg-blue-50 object-cover"
              />
            ))}
          </div>
        </DetailSection>
      )}

      {isCompleted && booking.afterServicePhotoUrls.length > 0 && (
        <DetailSection title={t('afterPhotosTitle')}>
          <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {booking.afterServicePhotoUrls.map((url, index) => (
              <PhotoTile
                key={`${url}-${index}`}
                url={url}
                alt={t('afterPhotoAlt', { index: index + 1 })}
                unavailableLabel={t('photoUnavailableLabel')}
                unavailableAlt={t('photoUnavailableAlt')}
                className="aspect-square w-full rounded-lg border border-gray-100 bg-blue-50 object-cover"
              />
            ))}
          </div>
        </DetailSection>
      )}
    </div>
  );
}
