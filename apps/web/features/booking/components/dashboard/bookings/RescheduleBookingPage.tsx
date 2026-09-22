'use client';

import { useEffect, useMemo, useState, type SubmitEvent } from 'react';
import { useTranslations } from 'next-intl';
import {
  BOOKING_STATUS,
  type AvailableSlot,
  type SlotConflictSuggestion,
  type StaffBookingDetailResponse,
} from '@ikaro/types';
import { Card, CardContent } from '@/shared/components/ui/card';
import { AvailabilityCarousel } from '@/features/booking/components/public/AvailabilityCarousel';
import { SlotPicker } from '@/features/booking/components/public/SlotPicker';
import { ApiError } from '@/shared/lib/api/errors';
import { fetchBookingAvailability } from '@/features/booking/api/availability';
import { formatDuration } from '@/shared/lib/formatting/format-duration';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
import { resolveErrorMessageFromApiError } from '@/shared/lib/i18n/resolve-error-message';
import { useRescheduleBooking } from '@/features/booking/hooks/useBookingMutations';
import { useDashboardTopbarStatus } from '@/shells/dashboard/components/topbar-status-context';
import { SlotConflictAlert } from './SlotConflictAlert';
import { BookingClientCard } from './BookingClientCard';
import { RescheduleActionRail } from './RescheduleActionRail';
import { RescheduleSuccessView } from './RescheduleSuccessView';

interface RescheduleBookingPageProps {
  readonly booking: StaffBookingDetailResponse;
  readonly tenantSlug: string;
  readonly maxBookingAdvanceDays: number;
  readonly backHref: string;
  readonly agendaHref: string;
}

export function RescheduleBookingPage({
  booking,
  tenantSlug,
  maxBookingAdvanceDays,
  backHref,
  agendaHref,
}: RescheduleBookingPageProps): React.JSX.Element {
  const t = useTranslations('dashboard.bookingDetail');
  const locale = useResolvedLocale();
  const { formatDateLong, formatTime } = useFormatting();
  const rescheduleBookingMutation = useRescheduleBooking();
  const topbarStatus = useDashboardTopbarStatus();
  const setTopbarBookingStatus = topbarStatus?.setBookingStatus;
  const [selectedDate, setSelectedDate] = useState(booking.scheduledAt.slice(0, 10));
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [slotSuggestions, setSlotSuggestions] = useState<readonly SlotConflictSuggestion[]>([]);
  const [conflictStartsAt, setConflictStartsAt] = useState<string | null>(null);
  const [rescheduled, setRescheduled] = useState(false);
  const [lastReschedule, setLastReschedule] = useState<{
    readonly from: string;
    readonly to: string;
  } | null>(null);
  const [isSubmittingLocal, setIsSubmittingLocal] = useState(false);

  const serviceIds = useMemo(() => booking.lines.map((line) => line.serviceId), [booking.lines]);
  const currentStart = new Date(booking.scheduledAt);
  const currentEnd = new Date(currentStart.getTime() + booking.totalDurationMins * 60_000);
  const pendingSubmit = rescheduleBookingMutation.isPending || isSubmittingLocal;

  useEffect(() => {
    setTopbarBookingStatus?.(booking.status);
  }, [booking.status, setTopbarBookingStatus]);

  useEffect(
    () => () => {
      setTopbarBookingStatus?.(null);
    },
    [setTopbarBookingStatus],
  );

  async function performReschedule(startsAt: string): Promise<void> {
    setIsSubmittingLocal(true);
    setError(null);

    try {
      await rescheduleBookingMutation.mutateAsync({
        id: booking.bookingId,
        body: {
          scheduledAt: startsAt,
          ...(adminNotes.trim() ? { adminNotes: adminNotes.trim() } : {}),
        },
      });
      setTopbarBookingStatus?.(BOOKING_STATUS.APPROVED);
      setLastReschedule({ from: booking.scheduledAt, to: startsAt });
      setRescheduled(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        try {
          const availability = await fetchBookingAvailability(tenantSlug, selectedDate, serviceIds);
          setSlotSuggestions(availability.slots);
          setConflictStartsAt(startsAt);
          return;
        } catch {
          setError(t('loadingAlternativesError'));
          return;
        }
      }

      setError(resolveErrorMessageFromApiError(err, locale));
    } finally {
      setIsSubmittingLocal(false);
    }
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedSlot) {
      setError(t('rescheduleRequired'));
      return;
    }

    await performReschedule(selectedSlot.startsAt);
  }

  if (rescheduled && lastReschedule) {
    return (
      <RescheduleSuccessView
        booking={booking}
        lastReschedule={lastReschedule}
        backHref={backHref}
        agendaHref={agendaHref}
      />
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pb-28 lg:space-y-6 lg:pb-0">
      {conflictStartsAt && (
        <SlotConflictAlert
          requestedAt={conflictStartsAt}
          totalDurationMins={booking.totalDurationMins}
          suggestions={slotSuggestions}
          chooseSlotLabel={t('rescheduleHere')}
          backLabel={t('backWithoutReschedule')}
          onChooseSlot={(startsAt) => void performReschedule(startsAt)}
          onBack={() => {
            setConflictStartsAt(null);
            setSlotSuggestions([]);
          }}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <BookingClientCard booking={booking} />

          <section>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.07em] text-gray-400">
              {t('currentSlotLabel')}
            </p>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm font-semibold text-gray-900">
                  {formatDateLong(currentStart)}
                </p>
                <p className="mt-1 text-sm text-gray-600">
                  {formatTime(currentStart)} – {formatTime(currentEnd)} (
                  {formatDuration(booking.totalDurationMins)})
                </p>
              </CardContent>
            </Card>
          </section>

          <section>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.07em] text-gray-400">
              {t('chooseNewDateLabel')}
            </p>
            <AvailabilityCarousel
              slug={tenantSlug}
              serviceIds={serviceIds}
              selectedDate={selectedDate}
              onSelectDate={(date) => {
                setSelectedDate(date);
                setSelectedSlot(null);
              }}
              carouselDays={14}
              maxBookingAdvanceDays={maxBookingAdvanceDays}
              variant="dashboard"
            />
          </section>

          {selectedDate && (
            <section>
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.07em] text-gray-400">
                {t('availableSlotsLabel')}
              </p>
              <SlotPicker
                slug={tenantSlug}
                serviceIds={serviceIds}
                date={selectedDate}
                selectedSlot={selectedSlot}
                onSelectSlot={setSelectedSlot}
                variant="dashboard"
              />
            </section>
          )}

          <section>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.07em] text-gray-400">
              {t('notesSection')}
            </p>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-gray-700">
                {t('notesLabel')}
              </span>
              <textarea
                value={adminNotes}
                onChange={(event) => setAdminNotes(event.target.value)}
                rows={4}
                maxLength={500}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none ring-0 placeholder:text-gray-400 focus:border-blue-500"
                placeholder={t('rescheduleNotesPlaceholder')}
              />
            </label>
          </section>
        </div>

        <RescheduleActionRail
          error={error}
          pendingSubmit={pendingSubmit}
          backHref={backHref}
          currentStart={currentStart}
          currentEnd={currentEnd}
          selectedSlot={selectedSlot}
        />
      </div>
    </form>
  );
}
