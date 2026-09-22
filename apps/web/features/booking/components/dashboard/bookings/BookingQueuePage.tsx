'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import type { StaffBookingListResponse } from '@ikaro/types';
import { WeekNav } from '@/shells/dashboard/components/WeekNav';
import { ApiError } from '@/shared/lib/api/errors';
import { Card, CardContent } from '@/shared/components/ui/card';
import {
  useActionNeededBookings,
  useTodayBookings,
  useUpcomingBookings,
} from '@/features/booking/hooks/useBookings';
import { useApproveBooking } from '@/features/booking/hooks/useBookingMutations';
import { addDays, inWindow, isSameDay, toISODate } from '@/shared/lib/formatting/date-utils';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
import { resolveErrorMessageFromApiError } from '@/shared/lib/i18n/resolve-error-message';
import { BookingCard } from './BookingCard';
import { BookingQueueSection } from './BookingQueueSection';

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
  const windowDays = welcomeStaffScreenDays;
  const approveBookingMutation = useApproveBooking();

  const todayDate = useMemo(() => new Date(today + 'T00:00:00'), [today]);

  const [windowStart, setWindowStart] = useState(() => todayDate);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);
  const windowEnd = useMemo(() => addDays(windowStart, windowDays - 1), [windowStart, windowDays]);

  const windowStartStr = toISODate(windowStart);
  const windowEndStr = toISODate(windowEnd);

  const todayInWindow = inWindow(todayDate, windowStart, windowEnd);
  const upcomingFrom = todayInWindow ? tomorrow : windowStartStr;
  const upcomingTo = windowEndStr;
  const upcomingVisible = new Date(upcomingFrom + 'T00:00:00') <= windowEnd;
  const handleApproveBooking = async (bookingId: string): Promise<void> => {
    setApproveError(null);
    try {
      await approveBookingMutation.mutateAsync({ id: bookingId });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        router.push(`/dashboard/bookings/${bookingId}?conflict=1`);
        return;
      }
      setApproveError(resolveErrorMessageFromApiError(err, locale));
    }
  };

  const { data: actionNeeded } = useActionNeededBookings(
    windowStartStr,
    windowEndStr,
    todayInWindow && isSameDay(windowStart, todayDate) ? initialActionNeeded : undefined,
  );
  const { data: todayData } = useTodayBookings(
    today,
    todayInWindow && isSameDay(windowStart, todayDate) ? initialToday : undefined,
  );
  const { data: upcoming } = useUpcomingBookings(
    upcomingFrom,
    upcomingTo,
    todayInWindow && isSameDay(windowStart, todayDate) ? initialUpcoming : undefined,
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
      dates.add(item.scheduledAt.slice(0, 10));
    }
    return dates;
  }, [actionNeeded, todayData, upcoming]);

  const selectedUpcomingDate =
    selectedDate && selectedDate >= upcomingFrom && selectedDate <= upcomingTo
      ? selectedDate
      : null;
  const upcomingItems = useMemo(() => {
    const items = upcoming?.items ?? [];
    if (!selectedUpcomingDate) return items;
    return items.filter((item) => item.scheduledAt.slice(0, 10) === selectedUpcomingDate);
  }, [selectedUpcomingDate, upcoming]);

  const handleWindowPrev = () => {
    setSelectedDate(null);
    setWindowStart((w) => addDays(w, -windowDays));
  };

  const handleWindowNext = () => {
    setSelectedDate(null);
    setWindowStart((w) => addDays(w, windowDays));
  };

  const handleSelectDate = (dateKey: string) => {
    setSelectedDate((current) => (current === dateKey ? null : dateKey));
  };

  return (
    <div>
      <WeekNav
        windowStart={windowStart}
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
        {approveError && (
          <Card className="mb-6 border-red-200 bg-red-50/80">
            <CardContent className="p-4 text-sm text-red-700">{approveError}</CardContent>
          </Card>
        )}

        <BookingQueueSection
          title={t('actionNeededTitle')}
          countLabel={
            actionNeeded?.items.length
              ? t('bookingCount', { count: actionNeeded.items.length })
              : null
          }
          hasItems={!!actionNeeded?.items.length}
          emptyMessage={t('emptyActionNeeded')}
        >
          {actionNeeded?.items.map((b) => (
            <BookingCard
              key={b.bookingId}
              booking={b}
              variant="action-needed"
              onApprove={() => handleApproveBooking(b.bookingId)}
              isApproving={approveBookingMutation.isPending}
            />
          ))}
        </BookingQueueSection>

        {todayInWindow && (
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

        {upcomingVisible && (
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
    </div>
  );
}
