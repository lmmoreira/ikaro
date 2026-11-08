'use client';

import { Textarea } from '@/shared/components/ui/textarea';
import { useEffect, useId } from 'react';
import { useTranslations } from 'next-intl';
import { BOOKING_STATUS, type StaffBookingDetailResponse } from '@ikaro/types';
import { useMarkCompleteLoyalty } from '@/features/booking/hooks/useMarkCompleteLoyalty';
import {
  computeCompletedBookingForDisplay,
  useMarkCompleteSubmission,
} from '@/features/booking/hooks/useMarkCompleteSubmission';
import { AfterServicePhotoUpload } from './AfterServicePhotoUpload';
import { Card, CardContent } from '@/shared/components/ui/card';
import { BookingClientCard } from './BookingClientCard';
import { MarkCompleteActionRail } from './MarkCompleteActionRail';
import { MarkCompleteLineFields } from './MarkCompleteLineFields';
import { MarkCompleteLoyaltyPanel } from './MarkCompleteLoyaltyPanel';
import { MarkCompleteSuccessView } from './MarkCompleteSuccessView';
import { MarkCompleteSummaryCard } from './MarkCompleteSummaryCard';
import { useDashboardTopbarStatus } from '@/shells/dashboard/components/topbar-status-context';
import { LabeledSection } from '@/shared/components/ui/labeled-section';
import { Label } from '@/shared/components/ui/label';

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
  const fieldId = useId();
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
            <LabeledSection title={t('beforePhotosLabel')}>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {booking.beforeServicePhotoUrls.map((url, index) => (
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
            </LabeledSection>
          )}

          <section>
            <Card>
              <CardContent className="p-4">
                <AfterServicePhotoUpload
                  slug={tenantSlug}
                  bookingId={booking.bookingId}
                  label={t('afterPhotosLabel')}
                  value={submission.afterServicePhotoUrls}
                  onChange={(filePaths) => submission.setAfterServicePhotoUrls(filePaths)}
                />
              </CardContent>
            </Card>
          </section>

          <section>
            <Card>
              <CardContent className="p-4">
                <p className="mb-3 text-sm font-semibold text-gray-900">{t('notesSection')}</p>
                <div className="block">
                  <Label htmlFor={fieldId}>{t('notesLabel')}</Label>
                  <Textarea
                    id={fieldId}
                    value={submission.adminNotes}
                    onChange={(event) => submission.setAdminNotes(event.target.value)}
                    rows={5}
                    maxLength={500}
                    placeholder={t('notesPlaceholder')}
                  />
                </div>
              </CardContent>
            </Card>
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
