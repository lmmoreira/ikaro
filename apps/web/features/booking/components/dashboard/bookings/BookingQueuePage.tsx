'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import type { StaffBookingListResponse } from '@ikaro/types';
import { WeekNav } from '@/shells/dashboard/components/WeekNav';
import { ApiError } from '@/shared/lib/api/errors';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import {
  useActionNeededBookings,
  useTodayBookings,
  useUpcomingBookings,
} from '@/features/booking/hooks/useBookings';
import { useApproveBooking } from '@/features/booking/hooks/useBookingMutations';
import { useAgendaFilter } from '@/features/booking/hooks/useAgendaFilter';
import { usePendingRecurringSchedules } from '@/features/booking/hooks/useRecurringSchedules';
import { sortByDecisionDeadline } from '@/features/booking/model/recurring-approval';
import { addDaysToDateKey } from '@/features/booking/schedule/date-utils';
import { toLocalDate } from '@/features/booking/schedule/schedule-timeline';
import { toISODateInTimezone } from '@/shared/lib/formatting/date-utils';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
import {
  extractProblemCode,
  resolveErrorMessageFromApiError,
} from '@/shared/lib/i18n/resolve-error-message';
import { FloatingFilterDock } from '../FloatingFilterDock';
import { AgendaFilterMenu } from './AgendaFilterMenu';
import { BookingCard } from './BookingCard';
import { BookingQueueActionNeeded } from './BookingQueueActionNeeded';
import { BookingQueueSection } from './BookingQueueSection';
import { NewMenu } from './NewMenu';

export interface BookingQueuePageProps {
  readonly initialActionNeeded?: StaffBookingListResponse;
  readonly initialToday?: StaffBookingListResponse;
  readonly initialUpcoming?: StaffBookingListResponse;
  readonly today: string;
  readonly tomorrow: string;
  readonly welcomeStaffScreenDays: number;
}

export function BookingQueuePage({
  initialActionNeeded,
  initialToday,
  initialUpcoming,
  today,
  tomorrow,
  welcomeStaffScreenDays,
}: BookingQueuePageProps): React.JSX.Element {
  const t = useTranslations('dashboard.bookingQueue');
  const locale = useResolvedLocale();
  const router = useRouter();
  const { timezone } = useFormatting();
  const windowDays = welcomeStaffScreenDays;
  const approveBookingMutation = useApproveBooking();
  const filter = useAgendaFilter();
  const pendingRecurrences = usePendingRecurringSchedules();

  // The window is tracked as tenant-local YYYY-MM-DD keys end to end. Keys are compared as strings
  // (ISO dates sort lexically) and shifted with pure date-key arithmetic, so no key is ever
  // round-tripped through the browser's or UTC's clock — that round trip shifted the window by a
  // day for a browser at a positive UTC offset.
  const [windowStartStr, setWindowStartStr] = useState(today);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);
  const windowEndStr = addDaysToDateKey(windowStartStr, windowDays - 1);

  // WeekNav takes Dates and renders them in browser-local time, so hand it local-midnight Dates —
  // the same convention SchedulePage uses via toLocalDate().
  const windowStartDate = useMemo(() => toLocalDate(windowStartStr), [windowStartStr]);
  const todayDate = useMemo(() => toLocalDate(today), [today]);

  const todayInWindow = today >= windowStartStr && today <= windowEndStr;
  const upcomingFrom = todayInWindow ? tomorrow : windowStartStr;
  const upcomingTo = windowEndStr;
  const upcomingVisible = upcomingFrom <= windowEndStr;
  const handleApproveBooking = async (bookingId: string): Promise<void> => {
    setApproveError(null);
    try {
      await approveBookingMutation.mutateAsync({ id: bookingId });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const reason = extractProblemCode(err);
        const query = new URLSearchParams({ conflict: '1', ...(reason ? { reason } : {}) });
        router.push(`/dashboard/bookings/${bookingId}?${query.toString()}`);
        return;
      }
      setApproveError(resolveErrorMessageFromApiError(err, locale));
    }
  };

  const isInitialWindow = todayInWindow && windowStartStr === today;
  const { data: actionNeeded } = useActionNeededBookings(
    windowStartStr,
    windowEndStr,
    isInitialWindow ? initialActionNeeded : undefined,
  );
  const { data: todayData } = useTodayBookings(today, isInitialWindow ? initialToday : undefined);
  const { data: upcoming } = useUpcomingBookings(
    upcomingFrom,
    upcomingTo,
    isInitialWindow ? initialUpcoming : undefined,
    upcomingVisible,
  );

  const activeDates = useMemo(() => {
    const dates = new Set<string>();
    const allItems = [
      ...(actionNeeded?.items ?? []),
      ...(todayData?.items ?? []),
      ...(upcoming?.items ?? []),
    ];
    for (const item of allItems) {
      // A booking's tenant-local day — its UTC date differs from it for a few hours every evening.
      dates.add(toISODateInTimezone(new Date(item.scheduledAt), timezone));
    }
    return dates;
  }, [actionNeeded, todayData, upcoming, timezone]);

  const selectedUpcomingDate =
    selectedDate && selectedDate >= upcomingFrom && selectedDate <= upcomingTo
      ? selectedDate
      : null;
  const upcomingItems = useMemo(() => {
    const items = upcoming?.items ?? [];
    if (!selectedUpcomingDate) return items;
    return items.filter(
      (item) => toISODateInTimezone(new Date(item.scheduledAt), timezone) === selectedUpcomingDate,
    );
  }, [selectedUpcomingDate, upcoming, timezone]);

  // Recurrence requests are not tied to the week window (they have no appointment date), so every
  // pending one shows whatever week the strip is on, closest decision deadline first.
  const recurrences = useMemo(
    () => sortByDecisionDeadline(pendingRecurrences.data ?? []),
    [pendingRecurrences.data],
  );

  const handleWindowPrev = () => {
    setSelectedDate(null);
    setWindowStartStr((w) => addDaysToDateKey(w, -windowDays));
  };

  const handleWindowNext = () => {
    setSelectedDate(null);
    setWindowStartStr((w) => addDaysToDateKey(w, windowDays));
  };

  const handleSelectDate = (dateKey: string) => {
    setSelectedDate((current) => (current === dateKey ? null : dateKey));
  };

  return (
    <div>
      <WeekNav
        windowStart={windowStartDate}
        windowDays={windowDays}
        today={todayDate}
        onPrev={handleWindowPrev}
        onNext={handleWindowNext}
        selectedDate={selectedDate}
        onSelectDate={handleSelectDate}
        disablePrev={false}
        activeDates={activeDates}
      />

      <div className="p-4">
        <div className="mb-4 flex justify-end">
          <NewMenu />
        </div>

        {approveError && (
          <Card className="mb-6 border-red-200 bg-red-50/80">
            <CardContent className="p-4 text-sm text-red-700">{approveError}</CardContent>
          </Card>
        )}

        {filter.allHidden ? (
          <div className="mb-6 flex flex-col items-start gap-2" data-testid="agenda-all-hidden">
            <p className="text-sm text-gray-400">{t('filterAllHidden')}</p>
            <Button type="button" variant="outline" size="sm" onClick={filter.reset}>
              {t('filterClear')}
            </Button>
          </div>
        ) : null}

        <BookingQueueActionNeeded
          bookings={actionNeeded?.items ?? []}
          recurrences={recurrences}
          showBookings={filter.isVisible('bookings')}
          showRecurrences={filter.isVisible('recurrences')}
          recurrencesFailed={pendingRecurrences.isError}
          onRetryRecurrences={() => void pendingRecurrences.refetch()}
          onApprove={handleApproveBooking}
          isApproving={approveBookingMutation.isPending}
        />

        {todayInWindow && filter.isVisible('today') && (
          <BookingQueueSection
            title={t('todayTitle')}
            countLabel={
              todayData?.items.length ? t('bookingCount', { count: todayData.items.length }) : null
            }
            hasItems={!!todayData?.items.length}
            emptyMessage={t('emptyToday')}
          >
            {todayData?.items.map((b) => (
              <BookingCard key={b.bookingId} booking={b} variant="today" />
            ))}
          </BookingQueueSection>
        )}

        {upcomingVisible && filter.isVisible('upcoming') && (
          <BookingQueueSection
            title={
              selectedUpcomingDate
                ? t('upcomingTitleFiltered', {
                    date: `${selectedUpcomingDate.slice(8, 10)}/${selectedUpcomingDate.slice(5, 7)}`,
                  })
                : t('upcomingTitle')
            }
            countLabel={
              upcomingItems.length ? t('bookingCount', { count: upcomingItems.length }) : null
            }
            hasItems={upcomingItems.length > 0}
            emptyMessage={selectedUpcomingDate ? t('emptyUpcomingFiltered') : t('emptyUpcoming')}
          >
            {upcomingItems.map((b) => (
              <BookingCard
                key={b.bookingId}
                booking={b}
                variant="upcoming"
                emphasized={!!selectedUpcomingDate}
              />
            ))}
          </BookingQueueSection>
        )}
      </div>

      <FloatingFilterDock pageKey="agenda">
        <AgendaFilterMenu
          containerRef={filter.menuRef}
          open={filter.menuOpen}
          onToggleOpen={filter.toggleMenu}
          hiddenOptions={filter.hiddenOptions}
          counts={{
            bookings: actionNeeded?.items.length ?? 0,
            recurrences: recurrences.length,
            today: todayData?.items.length ?? 0,
            upcoming: upcoming?.items.length ?? 0,
          }}
          onToggleOption={filter.toggleOption}
          onReset={filter.reset}
          onClose={filter.closeMenu}
        />
      </FloatingFilterDock>
    </div>
  );
}
