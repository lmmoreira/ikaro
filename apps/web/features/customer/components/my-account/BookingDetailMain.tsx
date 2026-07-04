'use client';

import { useTranslations } from 'next-intl';
import { Calendar, Clock, MessageSquare } from 'lucide-react';
import type { CustomerBookingDetailResponse } from '@ikaro/types';
import { BOOKING_STATUS } from '@ikaro/types';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';

interface BookingDetailMainProps {
  readonly booking: CustomerBookingDetailResponse;
}

interface DetailRowProps {
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly value: React.ReactNode;
  readonly last?: boolean;
}

function SectionLabel({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  return (
    <p className="mb-2.5 text-[0.6875rem] font-bold uppercase tracking-wider text-gray-400">
      {children}
    </p>
  );
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

export function BookingDetailMain({ booking }: BookingDetailMainProps): React.JSX.Element {
  const t = useTranslations('customer.bookingDetail');
  const { formatMoney, formatTime, formatDateLong } = useFormatting();

  const isCompleted = booking.status === BOOKING_STATUS.COMPLETED;
  const scheduledAt = booking.scheduledAt === null ? null : new Date(booking.scheduledAt);
  const totalDurationMins = booking.lines.reduce((sum, l) => sum + l.durationMinsAtBooking, 0);
  const iconClass = 'h-3.5 w-3.5 text-blue-600';

  return (
    <div className="flex flex-col gap-5">
      {isCompleted && booking.pointsEarned !== null && booking.pointsEarned > 0 && (
        <div className="rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm font-semibold text-green-800">
          {t('pointsEarnedBanner', { points: booking.pointsEarned })}
        </div>
      )}

      <section>
        <SectionLabel>{t('dateTimeTitle')}</SectionLabel>
        <div className="rounded-xl border border-gray-100 bg-white px-4 shadow-sm">
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
      </section>

      <section>
        <SectionLabel>{t('servicesTitle')}</SectionLabel>
        <div className="rounded-xl border border-gray-100 bg-white px-4 shadow-sm">
          {booking.lines.map((line) => (
            <div
              key={line.lineId}
              className="flex items-start justify-between gap-3 border-b border-gray-100 py-3"
            >
              <div>
                <p className="text-[0.9375rem] font-semibold text-gray-900">{line.serviceName}</p>
                <p className="mt-0.5 text-[0.8125rem] text-gray-500">
                  {line.durationMinsAtBooking} min
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
            <span className="text-base font-extrabold text-gray-900">
              {isCompleted && booking.totalActualPrice !== null
                ? formatMoney(booking.totalActualPrice.amount)
                : formatMoney(booking.totalPrice.amount)}
            </span>
          </div>
        </div>
        {isCompleted && booking.totalActualPrice !== null && (
          <p className="mt-1.5 text-right text-xs text-gray-400">
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
          <SectionLabel>{t('notesTitle')}</SectionLabel>
          <div className="rounded-xl border border-gray-100 bg-white px-4 shadow-sm">
            <DetailRow
              icon={<MessageSquare className={iconClass} aria-hidden="true" />}
              label=""
              value={<span className="font-normal">{booking.notes}</span>}
              last
            />
          </div>
        </section>
      )}

      {booking.infoResponseMessage !== null && (
        <section>
          <SectionLabel>{t('yourResponseTitle')}</SectionLabel>
          <p className="rounded-xl border border-gray-100 bg-white px-4 py-3 text-sm text-gray-700 shadow-sm">
            {booking.infoResponseMessage}
          </p>
        </section>
      )}

      {booking.beforeServicePhotoUrls.length > 0 && (
        <section>
          <SectionLabel>{t('beforePhotosTitle')}</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {booking.beforeServicePhotoUrls.map((url, index) => (
              <img
                key={`${url}-${index}`}
                src={url}
                alt={t('beforePhotoAlt', { index: index + 1 })}
                loading="lazy"
                className="h-[70px] w-[70px] rounded-lg border border-gray-100 bg-blue-50 object-cover"
              />
            ))}
          </div>
        </section>
      )}

      {isCompleted && booking.afterServicePhotoUrls.length > 0 && (
        <section>
          <SectionLabel>{t('afterPhotosTitle')}</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {booking.afterServicePhotoUrls.map((url, index) => (
              <img
                key={`${url}-${index}`}
                src={url}
                alt={t('afterPhotoAlt', { index: index + 1 })}
                loading="lazy"
                className="h-[70px] w-[70px] rounded-lg border border-gray-100 bg-blue-50 object-cover"
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
