'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { type SlotConflictSuggestion, type StaffBookingDetailResponse } from '@ikaro/types';
import { Badge } from '@/shared/components/ui/badge';
import { Card, CardContent } from '@/shared/components/ui/card';
import { fetchBookingAvailability } from '@/features/booking/api/availability';
import { cn } from '@/shared/utils/cn';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
import { useApproveBooking } from '@/features/booking/hooks/useBookingMutations';
import { useNoShowAvailability } from '@/features/booking/hooks/useNoShowAvailability';
import { buildApproveHandler } from '@/features/booking/model/booking-approve-action';
import { buildBookingSheetOutcomes } from '@/features/booking/model/booking-sheet-outcomes';
import { buildNoShowOutcomeHandlers } from '@/features/booking/model/booking-no-show-actions';
import {
  hasNoShowHistory,
  resolveCorrectionPoints,
} from '@/features/booking/model/booking-no-show';
import { useTenant } from '@/providers/tenant-provider';
import { BookingStatusHistory } from './BookingStatusHistory';
import { BookingDetailAsideCard } from './BookingDetailAsideCard';
import { BookingDetailMain } from './BookingDetailMain';
import { BookingDetailMainBanner, type BookingDetailActionState } from './BookingDetailMainBanner';
import { BookingDetailSheets, type BookingDetailSheetState } from './BookingDetailSheets';
import { SlotConflictAlert } from './SlotConflictAlert';
import {
  BOOKING_STATUS_CLASSES,
  buildBookingStatusLabels,
} from '@/features/booking/model/booking-status';
import { appendReturnTo } from '@/features/booking/model/booking-navigation';
import { useBookingDetailTopbarSync } from '@/features/booking/hooks/useBookingDetailTopbarSync';

type ActionState = BookingDetailActionState;
type SheetState = BookingDetailSheetState;

interface BookingDetailPageProps {
  readonly booking: StaffBookingDetailResponse;
  readonly tenantSlug: string;
  readonly showHeaderStatusBadge?: boolean;
  readonly initialActionState?: ActionState;
  readonly returnTo?: string | null;
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

export function BookingDetailPage({
  booking: initialBooking,
  tenantSlug,
  showHeaderStatusBadge = true,
  initialActionState = 'idle',
  returnTo = null,
}: BookingDetailPageProps): React.JSX.Element {
  const t = useTranslations('dashboard.bookingDetail');
  const locale = useResolvedLocale();
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
  const { role } = useTenant();
  const { noShowAvailableAt, noShowEndLabel } = useNoShowAvailability(booking);
  const correctionPoints = resolveCorrectionPoints(booking);
  const sheetOutcomes = buildBookingSheetOutcomes({ setBooking, setActionState, setSheetState });
  const noShowOutcome = buildNoShowOutcomeHandlers({
    bookingId: booking.bookingId,
    setBooking,
    setActionState,
    setSheetState,
  });
  useBookingDetailTopbarSync(booking.status, returnTo);
  const backHref = returnTo ?? '/dashboard/bookings';

  const serviceIds = useMemo(() => booking.lines.map((line) => line.serviceId), [booking.lines]);
  const approvedRangeLabel = useMemo(
    () => buildApprovedRangeLabel(booking.scheduledAt, booking.totalDurationMins, formatTime),
    [booking.scheduledAt, booking.totalDurationMins, formatTime],
  );
  const statusLabels = buildBookingStatusLabels(t);

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

  const handleApprove = buildApproveHandler({
    bookingId: booking.bookingId,
    scheduledAt: booking.scheduledAt,
    tenantSlug,
    serviceIds,
    mutateAsync: approveBookingMutation.mutateAsync,
    setBooking,
    setActionState,
    setSheetState,
    setSlotSuggestions,
    setInlineError,
    translateLoadingAlternativesError: () => t('loadingAlternativesError'),
    translateApproveError: () => t('approveError'),
  });

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
          <BookingDetailMainBanner
            actionState={actionState}
            booking={booking}
            approvedRangeLabel={approvedRangeLabel}
            noShowEndLabel={noShowEndLabel}
            correctionPoints={correctionPoints}
            onRefresh={noShowOutcome.onRefresh}
            onRetryNoShow={() => setSheetState('no-show')}
            onRetryCorrect={() => setSheetState('correct-no-show')}
          />

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

          {hasNoShowHistory(booking.statusHistory) && (
            <BookingStatusHistory entries={booking.statusHistory} />
          )}
        </div>

        <aside className="lg:block">
          <div className="space-y-4 lg:sticky lg:top-6">
            <BookingDetailAsideCard
              actionState={actionState}
              booking={booking}
              backHref={backHref}
              noShowAvailableAt={noShowAvailableAt}
              canCorrectNoShow={role === 'MANAGER'}
              onOpenNoShow={() => setSheetState('no-show')}
              onOpenCorrectNoShow={() => setSheetState('correct-no-show')}
              onBackWithoutApprove={() => {
                setActionState('idle');
                setSlotSuggestions([]);
                setInlineError(null);
              }}
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
              onApprove={() => void handleApprove()}
              onOpenReject={() => setSheetState('reject')}
              onOpenRequestInfo={() => setSheetState('info')}
            />
          </div>
        </aside>
      </div>

      <BookingDetailSheets
        bookingId={booking.bookingId}
        contactName={booking.contactName}
        correctionPoints={correctionPoints}
        correctionServices={booking.lines.map((line) => line.serviceName).join(', ')}
        sheetState={sheetState}
        isSubmitting={actionState === 'submitting'}
        locale={locale}
        onClose={() => setSheetState(null)}
        onSubmittingStart={() => {
          setActionState('submitting');
          setInlineError(null);
        }}
        onRejected={sheetOutcomes.onRejected}
        onInfoRequested={sheetOutcomes.onInfoRequested}
        onCancelled={sheetOutcomes.onCancelled}
        onSettleError={(message, isValidationError) => {
          setActionState('idle');
          if (!isValidationError) setInlineError(message);
        }}
        onNoShowMarked={noShowOutcome.onNoShowMarked}
        onNoShowFailed={noShowOutcome.onNoShowFailed}
        onNoShowCorrected={noShowOutcome.onNoShowCorrected}
        onCorrectFailed={noShowOutcome.onCorrectFailed}
      />
    </div>
  );
}
