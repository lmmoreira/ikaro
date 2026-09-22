'use client';

import { useTranslations } from 'next-intl';
import type { StaffBookingDetailResponse } from '@ikaro/types';
import { Card, CardContent } from '@/shared/components/ui/card';
import { formatDuration } from '@/shared/lib/formatting/format-duration';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { BookingCompletionSummary } from './BookingCompletionSummary';
import { BookingOutcomeLayout } from './BookingOutcomeLayout';

interface MarkCompleteSuccessViewProps {
  readonly booking: StaffBookingDetailResponse;
  readonly completedBookingForDisplay: StaffBookingDetailResponse;
  readonly linePrices: Record<string, string>;
  readonly finalChargedTotal: number;
  readonly showLoyaltyPanel: boolean;
  readonly pointsUsed: number;
  readonly discountAmount: number;
  readonly totalEarnedPoints: number;
  readonly backHref: string;
}

// Extracted from MarkCompleteBookingPage (TD37-S5A) — the post-completion success screen is a
// fully self-contained view, unrelated to the form logic in the default view.
export function MarkCompleteSuccessView({
  booking,
  completedBookingForDisplay,
  linePrices,
  finalChargedTotal,
  showLoyaltyPanel,
  pointsUsed,
  discountAmount,
  totalEarnedPoints,
  backHref,
}: MarkCompleteSuccessViewProps): React.JSX.Element {
  const t = useTranslations('dashboard.bookingDetail');
  const { formatDateLong, formatTime } = useFormatting();

  const scheduledAt = new Date(booking.scheduledAt);
  const scheduledEnd = new Date(scheduledAt.getTime() + booking.totalDurationMins * 60_000);
  const beforePhotos = completedBookingForDisplay.beforeServicePhotoUrls;

  return (
    <BookingOutcomeLayout
      booking={completedBookingForDisplay}
      tone="success"
      bannerTitle={t('completedTitle')}
      bannerBody={
        <BookingCompletionSummary
          quotedTotal={booking.totalPrice.amount}
          chargedTotal={finalChargedTotal}
          lines={booking.lines.map((line) => ({
            lineId: line.lineId,
            serviceName: line.serviceName,
            quotedPrice: line.priceAtBooking.amount,
            chargedPrice: Number(linePrices[line.lineId]) || 0,
          }))}
          discount={
            showLoyaltyPanel && pointsUsed > 0 ? { pointsUsed, amount: discountAmount } : null
          }
          pointsEarned={booking.customerId === null ? null : totalEarnedPoints}
        />
      }
      asideBody={t('completedAsideBody')}
      primaryAction={{ label: t('backToAgenda'), href: backHref }}
    >
      <section>
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.07em] text-gray-400">
          {t('scheduleSection')}
        </p>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-semibold text-gray-900">{formatDateLong(scheduledAt)}</p>
            <p className="mt-1 text-sm text-gray-600">
              {formatTime(scheduledAt)} – {formatTime(scheduledEnd)} (
              {formatDuration(booking.totalDurationMins)})
            </p>
          </CardContent>
        </Card>
      </section>

      {completedBookingForDisplay.afterServicePhotoUrls.length > 0 && (
        <section>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.07em] text-gray-400">
            {t('afterPhotosLabel')}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {completedBookingForDisplay.afterServicePhotoUrls.map((url, index) => (
              /* eslint-disable-next-line @next/next/no-img-element -- signed storage URLs are rendered as native thumbnails */
              <img
                key={`${url}-${index}`}
                src={url}
                alt={t('afterPhotoAlt', { index: index + 1 })}
                loading="lazy"
                className="aspect-square w-full rounded-lg border border-gray-200 object-cover"
              />
            ))}
          </div>
        </section>
      )}

      {beforePhotos.length > 0 && (
        <section>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.07em] text-gray-400">
            {t('beforePhotosLabel')}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {beforePhotos.map((url, index) => (
              /* eslint-disable-next-line @next/next/no-img-element -- signed storage URLs are rendered as native thumbnails */
              <img
                key={`${url}-${index}`}
                src={url}
                alt={t('beforePhotoAlt', { index: index + 1 })}
                loading="lazy"
                className="aspect-square w-full rounded-lg border border-gray-200 object-cover"
              />
            ))}
          </div>
        </section>
      )}
    </BookingOutcomeLayout>
  );
}
