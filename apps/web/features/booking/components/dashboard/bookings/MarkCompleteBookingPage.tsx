'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { BOOKING_STATUS, type StaffBookingDetailResponse } from '@ikaro/types';
import { useMarkCompleteLoyalty } from '@/features/booking/hooks/useMarkCompleteLoyalty';
import {
  computeCompletedBookingForDisplay,
  useMarkCompleteSubmission,
} from '@/features/booking/hooks/useMarkCompleteSubmission';
import { AfterServicePhotoUpload } from './AfterServicePhotoUpload';
import { BookingClientCard } from './BookingClientCard';
import { MarkCompleteActionRail } from './MarkCompleteActionRail';
import { MarkCompleteLineFields } from './MarkCompleteLineFields';
import { MarkCompleteLoyaltyPanel } from './MarkCompleteLoyaltyPanel';
import { MarkCompleteSuccessView } from './MarkCompleteSuccessView';
import { MarkCompleteSummaryCard } from './MarkCompleteSummaryCard';
import { useDashboardTopbarStatus } from '@/shells/dashboard/components/topbar-status-context';

interface MarkCompleteBookingPageProps {
  readonly booking: StaffBookingDetailResponse;
  readonly tenantSlug: string;
  readonly backHref: string;
  readonly pointsPerCurrencyUnit: number;
}

export function MarkCompleteBookingPage({
  booking,
  tenantSlug,
  backHref,
  pointsPerCurrencyUnit,
}: MarkCompleteBookingPageProps): React.JSX.Element {
  const t = useTranslations('dashboard.bookingDetail');
  const topbarStatus = useDashboardTopbarStatus();
  const setTopbarBookingStatus = topbarStatus?.setBookingStatus;
  const scheduledAt = new Date(booking.scheduledAt);
  const scheduledEnd = new Date(scheduledAt.getTime() + booking.totalDurationMins * 60_000);

  useEffect(() => {
    setTopbarBookingStatus?.(booking.status);
  }, [booking.status, setTopbarBookingStatus]);

  useEffect(
    () => () => {
      setTopbarBookingStatus?.(null);
    },
    [setTopbarBookingStatus],
  );

  const loyalty = useMarkCompleteLoyalty(booking, pointsPerCurrencyUnit);
  const submission = useMarkCompleteSubmission({
    booking,
    linePrices: loyalty.linePrices,
    showLoyaltyPanel: loyalty.showLoyaltyPanel,
    pointsUsed: loyalty.pointsUsed,
    discountAmount: loyalty.discountAmount,
    loyaltyBalance: loyalty.loyaltyBalance,
    totalEarnedPoints: loyalty.totalEarnedPoints,
    onCompletedStatus: () => setTopbarBookingStatus?.(BOOKING_STATUS.COMPLETED),
  });

  if (submission.completed) {
    const completedBookingForDisplay = computeCompletedBookingForDisplay(
      booking,
      loyalty.loyaltyBalance,
      loyalty.totalEarnedPoints,
      loyalty.pointsUsed,
      submission.completedBooking,
    );

    return (
      <MarkCompleteSuccessView
        booking={booking}
        completedBookingForDisplay={completedBookingForDisplay}
        linePrices={loyalty.linePrices}
        finalChargedTotal={loyalty.finalChargedTotal}
        showLoyaltyPanel={loyalty.showLoyaltyPanel}
        pointsUsed={loyalty.pointsUsed}
        discountAmount={loyalty.discountAmount}
        totalEarnedPoints={loyalty.totalEarnedPoints}
        backHref={backHref}
      />
    );
  }

  return (
    <form onSubmit={submission.handleSubmit} className="space-y-4 pb-28 lg:space-y-6 lg:pb-0">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <BookingClientCard booking={booking} />

          {loyalty.showLoyaltyPanel && (
            <MarkCompleteLoyaltyPanel
              loyaltyBalance={loyalty.loyaltyBalance}
              loyaltyPointsPerCurrencyUnit={loyalty.loyaltyPointsPerCurrencyUnit}
              maxRedeemablePoints={loyalty.maxRedeemablePoints}
              pointsUsed={loyalty.pointsUsed}
              discountAmount={loyalty.discountAmount}
              onPointsChange={loyalty.onPointsChange}
              onUseAllPoints={loyalty.onUseAllPoints}
            />
          )}

          <MarkCompleteLineFields
            lines={booking.lines}
            linePrices={loyalty.linePrices}
            onLinePriceChange={loyalty.onLinePriceChange}
          />

          <MarkCompleteSummaryCard
            scheduledAt={scheduledAt}
            scheduledEnd={scheduledEnd}
            totalDurationMins={booking.totalDurationMins}
            quotedTotal={booking.totalPrice.amount}
            chargedTotal={loyalty.finalChargedTotal}
            hasCustomer={booking.customerId !== null}
            totalEarnedPoints={loyalty.totalEarnedPoints}
            showLoyaltyPanel={loyalty.showLoyaltyPanel}
            pointsUsed={loyalty.pointsUsed}
            discountAmount={loyalty.discountAmount}
          />

          {booking.beforeServicePhotoUrls.length > 0 && (
            <section>
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.07em] text-gray-400">
                {t('beforePhotosLabel')}
              </p>
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
            </section>
          )}

          <section>
            <AfterServicePhotoUpload
              slug={tenantSlug}
              bookingId={booking.bookingId}
              label={t('afterPhotosLabel')}
              value={submission.afterServicePhotoUrls}
              onChange={(filePaths) => submission.setAfterServicePhotoUrls(filePaths)}
            />
          </section>

          <section>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.07em] text-gray-400">
              {t('notesSection')}
            </p>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-gray-700">
                {t('notesLabel')}
              </span>
              <textarea
                value={submission.adminNotes}
                onChange={(event) => submission.setAdminNotes(event.target.value)}
                rows={5}
                maxLength={500}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none ring-0 placeholder:text-gray-400 focus:border-blue-500"
                placeholder={t('notesPlaceholder')}
              />
            </label>
          </section>
        </div>

        <MarkCompleteActionRail
          error={submission.error}
          isSubmitting={submission.isSubmitting}
          backHref={backHref}
        />
      </div>
    </form>
  );
}
