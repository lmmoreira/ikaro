'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type SubmitEvent } from 'react';
import { useTranslations } from 'next-intl';
import {
  BOOKING_STATUS,
  type AvailableSlot,
  type SlotConflictSuggestion,
  type StaffBookingDetailResponse,
} from '@ikaro/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AvailabilityCarousel } from '@/components/booking/AvailabilityCarousel';
import { SlotPicker } from '@/components/booking/SlotPicker';
import { ApiError } from '@/lib/api/errors';
import { fetchBookingAvailability } from '@/lib/api/dashboard/fetch-booking-availability';
import { formatDuration } from '@/lib/formatting/format-duration';
import { useFormatting } from '@/lib/formatting/use-formatting';
import { useRescheduleBooking } from '@/lib/hooks/useBookingMutations';
import { useDashboardTopbarStatus } from '../topbar-status-context';
import { SlotConflictAlert } from './SlotConflictAlert';

interface RescheduleBookingPageProps {
  readonly booking: StaffBookingDetailResponse;
  readonly tenantSlug: string;
  readonly backHref: string;
}

function buildRangeLabel(
  start: string,
  totalDurationMins: number,
  formatDateLong: (date: Date) => string,
  formatTime: (date: Date) => string,
): string {
  const from = new Date(start);
  const to = new Date(from.getTime() + totalDurationMins * 60_000);
  return `${formatDateLong(from)} · ${formatTime(from)}–${formatTime(to)}`;
}

export function RescheduleBookingPage({
  booking,
  tenantSlug,
  backHref,
}: RescheduleBookingPageProps): React.JSX.Element {
  const t = useTranslations('dashboard.bookingDetail');
  const commonT = useTranslations('common');
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

      setError(t('rescheduleError'));
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
      <div className="space-y-4">
        <Card className="border-green-200 bg-green-50/80">
          <CardContent className="space-y-3 p-4">
            <p className="text-sm font-bold uppercase tracking-[0.07em] text-green-700">
              {t('rescheduledTitle')}
            </p>
            <p className="text-sm leading-6 text-green-700/90">
              {t('rescheduledBodyFrom', {
                range: buildRangeLabel(
                  lastReschedule.from,
                  booking.totalDurationMins,
                  formatDateLong,
                  formatTime,
                ),
              })}
            </p>
            <p className="text-sm leading-6 text-green-700/90">
              {t('rescheduledBodyTo', {
                range: buildRangeLabel(
                  lastReschedule.to,
                  booking.totalDurationMins,
                  formatDateLong,
                  formatTime,
                ),
              })}
            </p>
            <p className="text-sm leading-6 text-green-700/90">{t('rescheduledBodyStatus')}</p>
          </CardContent>
        </Card>

        <Button asChild className="w-full sm:w-auto">
          <Link href={backHref}>{commonT('back')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pb-28 lg:space-y-6 lg:pb-0">
      <p className="text-[0.9375rem] text-gray-900/70">
        {t('rescheduleSheetDescription', {
          name: booking.contactName,
          date: formatDateLong(currentStart),
          time: `${formatTime(currentStart)}–${formatTime(currentEnd)}`,
        })}
      </p>

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
                  {formatTime(currentStart)} — {formatTime(currentEnd)} (
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

        <aside className="hidden space-y-4 lg:block lg:sticky lg:top-6">
          <Card className="border-blue-200 bg-blue-50/70">
            <CardContent className="space-y-3 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.07em] text-blue-700">
                {t('summaryLabel')}
              </p>
              <div className="space-y-2 text-sm text-blue-700/90">
                <p>
                  {t('summaryCurrent', {
                    time: `${formatTime(currentStart)}–${formatTime(currentEnd)}`,
                  })}
                </p>
                <p>
                  {t('summaryNew', {
                    time: selectedSlot
                      ? `${formatTime(new Date(selectedSlot.startsAt))}–${formatTime(new Date(selectedSlot.endsAt))}`
                      : t('summaryPending'),
                  })}
                </p>
              </div>
            </CardContent>
          </Card>

          {error && (
            <Card className="border-red-200 bg-red-50/80">
              <CardContent className="p-4 text-sm text-red-700">{error}</CardContent>
            </Card>
          )}

          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-[0.07em] text-gray-400">
              {t('actionsSection')}
            </p>
            <Card>
              <CardContent className="space-y-3 p-4">
                <Button type="submit" disabled={pendingSubmit} className="w-full">
                  {t('submitReschedule')}
                </Button>
                <Button
                  asChild
                  className="w-full border-0 bg-white text-gray-900 shadow-sm hover:bg-gray-50"
                >
                  <Link href={backHref}>{commonT('cancel')}</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white p-4 pb-[calc(0.875rem+env(safe-area-inset-bottom))] shadow-[0_-2px_8px_rgba(0,0,0,0.06)] lg:hidden">
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-[0.07em] text-gray-400">
            {t('actionsSection')}
          </p>
          <Card>
            <CardContent className="space-y-3 p-4">
              <Button type="submit" disabled={pendingSubmit} className="w-full">
                {t('submitReschedule')}
              </Button>
              <Button
                asChild
                className="w-full border-0 bg-white text-gray-900 shadow-sm hover:bg-gray-50"
              >
                <Link href={backHref}>{commonT('cancel')}</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  );
}
