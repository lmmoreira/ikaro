'use client';

import type { StaffBookingDetailResponse } from '@ikaro/types';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { formatDuration } from '@/lib/formatting/format-duration';
import { useFormatting } from '@/lib/formatting/use-formatting';
import { BookingClientCard } from './BookingClientCard';

interface BookingDetailMainProps {
  readonly booking: StaffBookingDetailResponse;
}

export function BookingDetailMain({ booking }: BookingDetailMainProps): React.JSX.Element {
  const t = useTranslations('dashboard.bookingDetail');
  const { formatMoney, formatTime, formatDateLong } = useFormatting();
  const scheduledAt = new Date(booking.scheduledAt);
  const scheduledEnd = new Date(scheduledAt.getTime() + booking.totalDurationMins * 60_000);

  return (
    <div className="space-y-4">
      <BookingClientCard booking={booking} />

      {booking.infoRequestMessage && (
        <section>
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-xs font-bold uppercase tracking-[0.07em] text-gray-400">
              {t('infoExchangeSection')}
            </p>
            {booking.status === 'INFO_REQUESTED' && (
              <Badge className="border-0 bg-blue-100 text-[0.6875rem] text-blue-800">
                {t('infoSentLabel')}
              </Badge>
            )}
          </div>
          <Card>
            <CardContent className="space-y-2 p-4">
              <p className="text-sm font-semibold text-gray-900">{t('infoRequestedLabel')}</p>
              <p className="text-sm leading-6 text-gray-600">{booking.infoRequestMessage}</p>
              {booking.infoResponseMessage && (
                <>
                  <p className="pt-2 text-sm font-semibold text-gray-900">
                    {t('infoResponseLabel')}
                  </p>
                  <p className="text-sm leading-6 text-gray-600">{booking.infoResponseMessage}</p>
                </>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      <section>
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.07em] text-gray-400">
          {t('scheduleSection')}
        </p>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-700">
              <svg
                aria-hidden="true"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-gray-900">{formatDateLong(scheduledAt)}</p>
              <p className="mt-0.5 text-sm text-gray-600">
                {formatTime(scheduledAt)} — {formatTime(scheduledEnd)} ({booking.totalDurationMins}{' '}
                min)
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section>
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.07em] text-gray-400">
          {t('servicesSection')}
        </p>
        <Card>
          <CardHeader className="pb-3">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-3 text-[0.6875rem] font-bold uppercase tracking-[0.07em] text-gray-400">
              <span>{t('serviceHeader')}</span>
              <span className="text-right">{t('priceHeader')}</span>
              <span className="text-right">{t('durationHeader')}</span>
              <span className="text-right">{t('pointsHeader')}</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-0 p-0">
            {booking.lines.map((line) => (
              <div
                key={line.lineId}
                className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-3 border-t border-gray-100 px-4 py-3 first:border-t-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900">{line.serviceName}</p>
                </div>
                <p className="text-right text-sm font-bold text-blue-700">
                  {formatMoney(line.priceAtBooking.amount)}
                </p>
                <p className="text-right text-sm text-gray-600">
                  {formatDuration(line.durationMinsAtBooking)}
                </p>
                <p className="text-right text-sm text-gray-600">+{line.pointsValueAtBooking}</p>
              </div>
            ))}
            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-3 border-t border-gray-100 bg-gray-50 px-4 py-3">
              <p className="text-sm font-semibold text-gray-900">{t('totalLabel')}</p>
              <p className="text-right text-sm font-bold text-blue-700">
                {formatMoney(booking.totalPrice.amount)}
              </p>
              <p className="text-right text-sm font-semibold text-gray-600">
                {formatDuration(booking.totalDurationMins)}
              </p>
              <p className="text-right text-sm font-semibold text-gray-600">
                {booking.lines.reduce((total, line) => total + line.pointsValueAtBooking, 0)}
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      {(booking.beforeServicePhotoUrls.length > 0 || booking.afterServicePhotoUrls.length > 0) && (
        <section>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.07em] text-gray-400">
            {t('photosSection')}
          </p>
          <div className="space-y-4">
            {booking.beforeServicePhotoUrls.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-semibold text-gray-900">{t('beforePhotosLabel')}</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {booking.beforeServicePhotoUrls.map((url, index) => (
                    <img
                      key={`${url}-${index}`}
                      src={url}
                      alt={t('beforePhotoAlt', { index: index + 1 })}
                      loading="lazy"
                      className="aspect-square w-full rounded-lg border border-gray-200 object-cover"
                    />
                  ))}
                </div>
              </div>
            )}

            {booking.afterServicePhotoUrls.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-semibold text-gray-900">{t('afterPhotosLabel')}</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {booking.afterServicePhotoUrls.map((url, index) => (
                    <img
                      key={`${url}-${index}`}
                      src={url}
                      alt={t('afterPhotoAlt', { index: index + 1 })}
                      loading="lazy"
                      className="aspect-square w-full rounded-lg border border-gray-200 object-cover"
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
