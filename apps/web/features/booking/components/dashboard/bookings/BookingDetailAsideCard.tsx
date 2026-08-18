'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { BOOKING_STATUS, type StaffBookingDetailResponse } from '@ikaro/types';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { BookingActionPanel } from './BookingActionPanel';
import type { BookingDetailActionState } from './BookingDetailMainBanner';

function BackToAgendaActionsCard({ backHref }: { readonly backHref: string }): React.JSX.Element {
  const t = useTranslations('dashboard.bookingDetail');

  return (
    <div className="space-y-2">
      <p className="text-xs font-bold uppercase tracking-[0.07em] text-gray-400">
        {t('actionsSection')}
      </p>
      <Card>
        <CardContent className="p-4">
          <Button asChild className="w-full">
            <Link href={backHref}>{t('backToAgenda')}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

interface BookingDetailAsideCardProps {
  readonly actionState: BookingDetailActionState;
  readonly booking: StaffBookingDetailResponse;
  readonly backHref: string;
  readonly onBackWithoutApprove: () => void;
  readonly onOpenComplete: () => void;
  readonly onOpenReschedule: () => void;
  readonly onOpenCancel: () => void;
  readonly onApprove: () => void;
  readonly onOpenReject: () => void;
  readonly onOpenRequestInfo: () => void;
}

// Extracted from BookingDetailPage (TD37-S5A) — the aside action card is a self-contained
// switch over actionState/booking.status, unrelated to the main banner or sheets around it.
export function BookingDetailAsideCard({
  actionState,
  booking,
  backHref,
  onBackWithoutApprove,
  onOpenComplete,
  onOpenReschedule,
  onOpenCancel,
  onApprove,
  onOpenReject,
  onOpenRequestInfo,
}: BookingDetailAsideCardProps): React.JSX.Element | null {
  const t = useTranslations('dashboard.bookingDetail');
  const { formatTime } = useFormatting();

  if (actionState === 'approved' || actionState === 'rejected') {
    return <BackToAgendaActionsCard backHref={backHref} />;
  }

  if (actionState === 'slot-conflict') {
    return (
      <Card className="border-gray-200">
        <CardContent className="space-y-3 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.07em] text-gray-400">
            {t('approvingLabel')}
          </p>
          <p className="text-sm font-semibold text-gray-900">{booking.contactName}</p>
          <p className="text-sm text-gray-500">
            {booking.lines.map((line) => line.serviceName).join(' · ')}
          </p>
          <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-600">
            {t('requestedSlotLabel', { time: formatTime(new Date(booking.scheduledAt)) })}
          </p>
          <Button type="button" variant="ghost" className="w-full" onClick={onBackWithoutApprove}>
            {t('backWithoutApprove')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (booking.status === BOOKING_STATUS.APPROVED) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white p-4 lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:p-0">
        <BookingActionPanel
          bookingStatus={BOOKING_STATUS.APPROVED}
          isSubmitting={actionState === 'submitting'}
          onOpenComplete={onOpenComplete}
          onOpenReschedule={onOpenReschedule}
          onOpenCancel={onOpenCancel}
        />
      </div>
    );
  }

  if (actionState === 'cancelled') {
    return (
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white p-4 lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:p-0">
        <Card>
          <CardContent className="space-y-3 p-4">
            <p className="text-sm text-gray-600">
              {t('cancelledAsideBody', { name: booking.contactName })}
            </p>
            <Button asChild className="w-full">
              <Link href={backHref}>{t('backToAgenda')}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (booking.status === BOOKING_STATUS.COMPLETED) {
    return <BackToAgendaActionsCard backHref={backHref} />;
  }

  if (booking.status === BOOKING_STATUS.REJECTED || booking.status === BOOKING_STATUS.CANCELLED) {
    return null;
  }

  const triageStatus =
    booking.status === BOOKING_STATUS.INFO_REQUESTED
      ? BOOKING_STATUS.INFO_REQUESTED
      : BOOKING_STATUS.PENDING;

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white p-4 lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:p-0">
      <BookingActionPanel
        bookingStatus={triageStatus}
        isSubmitting={actionState === 'submitting'}
        onApprove={onApprove}
        onOpenReject={onOpenReject}
        onOpenRequestInfo={onOpenRequestInfo}
      />
    </div>
  );
}
