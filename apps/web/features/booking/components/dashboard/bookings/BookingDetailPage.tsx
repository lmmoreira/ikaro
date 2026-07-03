'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import {
  BOOKING_STATUS,
  type SlotConflictSuggestion,
  type StaffBookingDetailResponse,
} from '@ikaro/types';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { Card, CardContent } from '@/shared/components/ui/card';
import { ApiError } from '@/shared/lib/api/errors';
import { fetchBookingAvailability } from '@/features/booking/api/availability';
import { cn } from '@/shared/utils/cn';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import {
  useApproveBooking,
  useCancelBooking,
  useRejectBooking,
  useRequestMoreInfo,
} from '@/features/booking/hooks/useBookingMutations';
import { BookingActionPanel } from './BookingActionPanel';
import { BookingCompletionSummary } from './BookingCompletionSummary';
import { BookingDetailMain } from './BookingDetailMain';
import { AdminCancelBookingSheet } from './AdminCancelBookingSheet';
import { RejectBookingSheet } from './RejectBookingSheet';
import { RequestInfoSheet } from './RequestInfoSheet';
import { SlotConflictAlert } from './SlotConflictAlert';
import {
  BOOKING_STATUS_CLASSES,
  buildBookingStatusLabels,
} from '@/features/booking/model/booking-status';
import { appendReturnTo } from '@/features/booking/model/booking-navigation';
import { useDashboardTopbarStatus } from '@/shells/dashboard/components/topbar-status-context';

type ActionState =
  | 'idle'
  | 'submitting'
  | 'approved'
  | 'rejected'
  | 'info-requested'
  | 'slot-conflict'
  | 'cancelled';
type SheetState = 'reject' | 'info' | 'cancel' | null;

interface BookingDetailPageProps {
  readonly booking: StaffBookingDetailResponse;
  readonly tenantSlug: string;
  readonly showHeaderStatusBadge?: boolean;
  readonly initialActionState?: ActionState;
  readonly returnTo?: string | null;
}

interface ProblemDetailsViolation {
  readonly field: string;
  readonly message: string;
}

interface ProblemDetailsResponse {
  readonly violations?: readonly ProblemDetailsViolation[];
}

type BannerVariant = 'success' | 'danger' | 'info';

function BannerIcon({ variant }: { readonly variant: BannerVariant }): React.JSX.Element {
  const backgroundClass = getBannerIconBackgroundClass(variant);
  const strokeColor = 'white';
  const icon = getBannerIconSvg(variant, strokeColor);

  return (
    <div
      className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${backgroundClass}`}
    >
      {icon}
    </div>
  );
}

function getBannerIconBackgroundClass(variant: BannerVariant): string {
  if (variant === 'success') {
    return 'bg-green-600';
  }

  if (variant === 'danger') {
    return 'bg-red-600';
  }

  return 'bg-blue-600';
}

function getBannerIconSvg(variant: BannerVariant, strokeColor: string): React.JSX.Element {
  if (variant === 'danger') {
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke={strokeColor}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    );
  }

  if (variant === 'info') {
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke={strokeColor}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="10" x2="12" y2="16" />
        <circle cx="12" cy="7.5" r="1" fill={strokeColor} stroke="none" />
      </svg>
    );
  }

  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke={strokeColor}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function buildApprovedRangeLabel(
  scheduledAt: string,
  totalDurationMins: number,
  formatTime: (date: Date) => string,
): string {
  const start = new Date(scheduledAt);
  const end = new Date(start.getTime() + totalDurationMins * 60_000);
  return `${formatTime(start)}–${formatTime(end)}`;
}

function extractValidationMessage(err: unknown, field: string): string | null {
  if (!(err instanceof ApiError) || err.status !== 400) return null;
  const data = err.data as ProblemDetailsResponse | undefined;
  const violation = data?.violations?.find((item) => item.field === field);
  return violation?.message ?? null;
}

export function BookingDetailPage({
  booking: initialBooking,
  tenantSlug,
  showHeaderStatusBadge = true,
  initialActionState = 'idle',
  returnTo = null,
}: BookingDetailPageProps): React.JSX.Element {
  const t = useTranslations('dashboard.bookingDetail');
  const { formatTime } = useFormatting();
  const router = useRouter();
  const [booking, setBooking] = useState(initialBooking);
  const [actionState, setActionState] = useState<ActionState>(initialActionState);
  const [sheetState, setSheetState] = useState<SheetState>(null);
  const [slotSuggestions, setSlotSuggestions] = useState<readonly SlotConflictSuggestion[]>([]);
  const [isLoadingSlotSuggestions, setIsLoadingSlotSuggestions] = useState(
    initialActionState === 'slot-conflict',
  );
  const [inlineError, setInlineError] = useState<string | null>(null);
  const approveBookingMutation = useApproveBooking();
  const cancelBookingMutation = useCancelBooking();
  const rejectBookingMutation = useRejectBooking();
  const requestMoreInfoMutation = useRequestMoreInfo();
  const topbarStatus = useDashboardTopbarStatus();
  const setTopbarBookingStatus = topbarStatus?.setBookingStatus;
  const setBackHrefOverride = topbarStatus?.setBackHrefOverride;
  const backHref = returnTo ?? '/dashboard/bookings';

  const serviceIds = useMemo(() => booking.lines.map((line) => line.serviceId), [booking.lines]);
  const approvedRangeLabel = useMemo(
    () => buildApprovedRangeLabel(booking.scheduledAt, booking.totalDurationMins, formatTime),
    [booking.scheduledAt, booking.totalDurationMins, formatTime],
  );
  const statusLabels = buildBookingStatusLabels(t);

  useEffect(() => {
    setTopbarBookingStatus?.(booking.status);
  }, [booking.status, setTopbarBookingStatus]);

  useEffect(() => {
    setBackHrefOverride?.(returnTo);
    return () => {
      setBackHrefOverride?.(null);
    };
  }, [returnTo, setBackHrefOverride]);

  useEffect(() => {
    if (initialActionState !== 'slot-conflict') return;

    let active = true;

    void (async () => {
      try {
        const availability = await fetchBookingAvailability(
          tenantSlug,
          booking.scheduledAt.slice(0, 10),
          serviceIds,
        );
        if (!active) return;
        setSlotSuggestions(availability.slots);
      } catch {
        if (!active) return;
        setActionState('idle');
        setInlineError(t('loadingAlternativesError'));
      } finally {
        if (active) setIsLoadingSlotSuggestions(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [booking.scheduledAt, initialActionState, serviceIds, t, tenantSlug]);

  useEffect(
    () => () => {
      setTopbarBookingStatus?.(null);
    },
    [setTopbarBookingStatus],
  );

  async function handleApprove(nextScheduledAt?: string): Promise<void> {
    setActionState('submitting');
    setInlineError(null);

    try {
      await approveBookingMutation.mutateAsync(
        nextScheduledAt
          ? { id: booking.bookingId, body: { scheduledAt: nextScheduledAt } }
          : { id: booking.bookingId },
      );
      setBooking((current) => ({
        ...current,
        status: BOOKING_STATUS.APPROVED,
        scheduledAt: nextScheduledAt ?? current.scheduledAt,
        approvedAt: new Date().toISOString(),
      }));
      setSheetState(null);
      setSlotSuggestions([]);
      setActionState('approved');
      return;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        try {
          const availability = await fetchBookingAvailability(
            tenantSlug,
            booking.scheduledAt.slice(0, 10),
            serviceIds,
          );
          setSlotSuggestions(availability.slots);
          setActionState('slot-conflict');
          return;
        } catch {
          setActionState('idle');
          setInlineError(t('loadingAlternativesError'));
          return;
        }
      }

      setActionState('idle');
      setInlineError(t('approveError'));
    }
  }

  async function handleReject(reason: string): Promise<void> {
    await rejectBookingMutation.mutateAsync({ id: booking.bookingId, body: { reason } });
    setBooking((current) => ({
      ...current,
      status: BOOKING_STATUS.REJECTED,
      rejectionReason: reason,
    }));
    setSheetState(null);
    setActionState('rejected');
  }

  async function handleRequestInfo(message: string): Promise<void> {
    await requestMoreInfoMutation.mutateAsync({
      id: booking.bookingId,
      body: { message },
    });
    setBooking((current) => ({
      ...current,
      status: BOOKING_STATUS.INFO_REQUESTED,
      infoRequestMessage: message,
    }));
    setSheetState(null);
    setActionState('info-requested');
  }

  async function handleCancel(reason?: string): Promise<void> {
    await cancelBookingMutation.mutateAsync({
      id: booking.bookingId,
      ...(reason ? { body: { reason } } : {}),
    });
    setBooking((current) => ({
      ...current,
      status: BOOKING_STATUS.CANCELLED,
    }));
    setSheetState(null);
    setActionState('cancelled');
  }

  function renderMainBanner(): React.JSX.Element | null {
    if (actionState === 'approved') {
      return (
        <Card className="border-green-200 bg-green-50/80">
          <CardContent className="flex items-start gap-3 p-4">
            <BannerIcon variant="success" />
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
            <BannerIcon variant="danger" />
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
            <BannerIcon variant="info" />
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
            <BannerIcon variant="danger" />
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
            <BannerIcon variant="success" />
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
                    booking.customerId !== null
                      ? booking.lines.reduce((sum, line) => sum + line.pointsValueAtBooking, 0)
                      : null
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

  function renderAsideCard(): React.JSX.Element | null {
    if (actionState === 'approved') {
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

    if (actionState === 'rejected') {
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
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                setActionState('idle');
                setSlotSuggestions([]);
                setInlineError(null);
              }}
            >
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
            onOpenComplete={() =>
              router.push(
                appendReturnTo(`/dashboard/bookings/${booking.bookingId}/complete`, returnTo),
              )
            }
            onOpenReschedule={() =>
              router.push(
                appendReturnTo(`/dashboard/bookings/${booking.bookingId}/reschedule`, returnTo),
              )
            }
            onOpenCancel={() => setSheetState('cancel')}
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
          onApprove={() => void handleApprove()}
          onOpenReject={() => setSheetState('reject')}
          onOpenRequestInfo={() => setSheetState('info')}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-28 lg:space-y-6 lg:pb-0" data-testid="booking-detail-page">
      {showHeaderStatusBadge && (
        <div className="flex justify-end">
          <Badge
            className={cn(
              'shrink-0 rounded-full border-0 px-4 py-2 text-sm font-semibold sm:px-5 sm:py-2.5 sm:text-base',
              BOOKING_STATUS_CLASSES[booking.status] ?? 'bg-gray-100 text-gray-600',
            )}
          >
            {statusLabels[booking.status] ?? booking.status}
          </Badge>
        </div>
      )}

      {inlineError && (
        <Card className="border-red-200 bg-red-50/70">
          <CardContent className="p-4 text-sm text-red-700">{inlineError}</CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          {renderMainBanner()}

          {actionState === 'slot-conflict' && (
            <SlotConflictAlert
              requestedAt={booking.scheduledAt}
              totalDurationMins={booking.totalDurationMins}
              suggestions={slotSuggestions}
              isLoading={isLoadingSlotSuggestions}
              onChooseSlot={(startsAt) => void handleApprove(startsAt)}
              onBack={() => {
                setActionState('idle');
                setSlotSuggestions([]);
                setIsLoadingSlotSuggestions(false);
              }}
            />
          )}

          <BookingDetailMain booking={booking} />
        </div>

        <aside className="lg:block">
          <div className="space-y-4 lg:sticky lg:top-6">{renderAsideCard()}</div>
        </aside>
      </div>

      {sheetState === 'reject' && (
        <RejectBookingSheet
          open={true}
          isSubmitting={actionState === 'submitting'}
          onClose={() => setSheetState(null)}
          onSubmit={async (reason) => {
            setActionState('submitting');
            setInlineError(null);
            try {
              await handleReject(reason);
            } catch (err) {
              setActionState('idle');
              const validationMessage = extractValidationMessage(err, 'reason');
              if (validationMessage) {
                throw new Error(validationMessage);
              }
              setInlineError(t('rejectError'));
              throw new Error(t('rejectError'));
            }
          }}
        />
      )}

      {sheetState === 'info' && (
        <RequestInfoSheet
          open={true}
          isSubmitting={actionState === 'submitting'}
          onClose={() => setSheetState(null)}
          onSubmit={async (message) => {
            setActionState('submitting');
            setInlineError(null);
            try {
              await handleRequestInfo(message);
            } catch (err) {
              setActionState('idle');
              const validationMessage = extractValidationMessage(err, 'message');
              if (validationMessage) {
                throw new Error(validationMessage);
              }
              setInlineError(t('requestInfoError'));
              throw new Error(t('requestInfoError'));
            }
          }}
        />
      )}

      {sheetState === 'cancel' && (
        <AdminCancelBookingSheet
          open={true}
          isSubmitting={actionState === 'submitting'}
          onClose={() => setSheetState(null)}
          onSubmit={async (reason) => {
            setActionState('submitting');
            setInlineError(null);
            try {
              await handleCancel(reason);
            } catch {
              setActionState('idle');
              setInlineError(t('cancelError'));
              throw new Error(t('cancelError'));
            }
          }}
        />
      )}
    </div>
  );
}
