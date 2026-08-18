'use client';

import { useTranslations } from 'next-intl';
import { BOOKING_STATUS, type StaffBookingDetailResponse } from '@ikaro/types';
import { Card, CardContent } from '@/shared/components/ui/card';
import { BookingCompletionSummary } from './BookingCompletionSummary';
import { BookingStatusBannerIcon } from './BookingStatusBannerIcon';

export type BookingDetailActionState =
  | 'idle'
  | 'submitting'
  | 'approved'
  | 'rejected'
  | 'info-requested'
  | 'slot-conflict'
  | 'cancelled';

interface BookingDetailMainBannerProps {
  readonly actionState: BookingDetailActionState;
  readonly booking: StaffBookingDetailResponse;
  readonly approvedRangeLabel: string;
}

// Extracted from BookingDetailPage (TD37-S5A) — the status banner is a self-contained switch
// over actionState/booking.status, unrelated to the action panel or sheets around it.
export function BookingDetailMainBanner({
  actionState,
  booking,
  approvedRangeLabel,
}: BookingDetailMainBannerProps): React.JSX.Element | null {
  const t = useTranslations('dashboard.bookingDetail');

  if (actionState === 'approved') {
    return (
      <Card className="border-green-200 bg-green-50/80">
        <CardContent className="flex items-start gap-3 p-4">
          <BookingStatusBannerIcon variant="success" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold uppercase tracking-[0.07em] text-green-700">
              {t('approvedTitle')}
            </p>
            <p className="mt-2 text-sm leading-6 text-green-700/90">
              {t('approvedBodyName', { name: booking.contactName })}
            </p>
            <p className="mt-2 text-sm leading-6 text-green-700/90">
              {t('approvedBodyRange', { range: approvedRangeLabel })}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (actionState === 'rejected') {
    return (
      <Card className="border-red-200 bg-red-50/80">
        <CardContent className="flex items-start gap-3 p-4">
          <BookingStatusBannerIcon variant="danger" />
          <div className="min-w-0 flex-1">
            <p
              data-testid="booking-rejected-title"
              className="text-sm font-bold uppercase tracking-[0.07em] text-red-700"
            >
              {t('rejectedTitle')}
            </p>
            <p
              data-testid="booking-rejected-reason"
              className="mt-2 text-sm leading-6 text-red-700/90"
            >
              {t('rejectedBodyReason', { reason: booking.rejectionReason ?? '' })}
            </p>
            <p
              data-testid="booking-rejected-notification"
              className="mt-2 text-sm leading-6 text-red-700/90"
            >
              {t('rejectedBodyNotification')}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (actionState === 'info-requested') {
    return (
      <Card className="border-blue-200 bg-blue-50/80">
        <CardContent className="flex items-start gap-3 p-4">
          <BookingStatusBannerIcon variant="info" />
          <div className="min-w-0 flex-1">
            <p
              data-testid="booking-info-requested-title"
              className="text-sm font-bold uppercase tracking-[0.07em] text-blue-700"
            >
              {t('infoRequestedTitle')}
            </p>
            <p
              data-testid="booking-info-requested-message"
              className="mt-2 text-sm leading-6 text-blue-700/90"
            >
              {t('infoRequestedBodyMessage', { message: booking.infoRequestMessage ?? '' })}
            </p>
            <p
              data-testid="booking-info-requested-status"
              className="mt-2 text-sm leading-6 text-blue-700/90"
            >
              {t('infoRequestedBodyStatus', { status: t('statusPending') })}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (actionState === 'cancelled') {
    return (
      <Card className="border-red-200 bg-red-50/80">
        <CardContent className="flex items-start gap-3 p-4">
          <BookingStatusBannerIcon variant="danger" />
          <div className="min-w-0 flex-1">
            <p
              data-testid="booking-cancelled-title"
              className="text-sm font-bold uppercase tracking-[0.07em] text-red-700"
            >
              {t('cancelledTitle')}
            </p>
            <p
              data-testid="booking-cancelled-email"
              className="mt-2 text-sm leading-6 text-red-700/90"
            >
              {t('cancelledBodyEmail', { name: booking.contactName })}
            </p>
            <p className="mt-2 text-sm leading-6 text-red-700/90">
              {t('cancelledBodyRange', { range: approvedRangeLabel })}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (booking.status === BOOKING_STATUS.COMPLETED) {
    return (
      <Card className="border-green-200 bg-green-50/80">
        <CardContent className="flex items-start gap-3 p-4">
          <BookingStatusBannerIcon variant="success" />
          <div className="min-w-0 flex-1">
            <p
              data-testid="booking-completed-title"
              className="text-sm font-bold uppercase tracking-[0.07em] text-green-700"
            >
              {t('completedTitle')}
            </p>
            <div className="mt-2 text-sm leading-6 text-green-700/90">
              <BookingCompletionSummary
                quotedTotal={booking.totalPrice.amount}
                chargedTotal={booking.totalActualPrice?.amount ?? booking.totalPrice.amount}
                lines={booking.lines.map((line) => ({
                  lineId: line.lineId,
                  serviceName: line.serviceName,
                  quotedPrice: line.priceAtBooking.amount,
                  chargedPrice: line.actualPriceCharged?.amount ?? line.priceAtBooking.amount,
                }))}
                discount={
                  booking.discountAmount !== null && booking.discountPointsUsed !== null
                    ? {
                        pointsUsed: booking.discountPointsUsed,
                        amount: booking.discountAmount.amount,
                      }
                    : null
                }
                pointsEarned={
                  booking.customerId === null
                    ? null
                    : booking.lines.reduce((sum, line) => sum + line.pointsValueAtBooking, 0)
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
}
