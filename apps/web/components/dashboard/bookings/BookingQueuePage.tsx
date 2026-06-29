'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { StaffBookingListResponse } from '@ikaro/types';
import { WeekNav } from '@/components/dashboard/WeekNav';
import {
  useActionNeededBookings,
  useTodayBookings,
  useUpcomingBookings,
} from '@/lib/hooks/useBookings';
import { useApproveBooking } from '@/lib/hooks/useBookingMutations';
import { addDays, inWindow, isSameDay, toDateKey } from '@/lib/utils/date-utils';
import { BookingCard } from './BookingCard';

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
  const windowDays = welcomeStaffScreenDays;
  const approveBookingMutation = useApproveBooking();

  const todayDate = useMemo(() => new Date(today + 'T00:00:00'), [today]);

  const [windowStart, setWindowStart] = useState(() => todayDate);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const windowEnd = useMemo(() => addDays(windowStart, windowDays - 1), [windowStart, windowDays]);

  const windowStartStr = toDateKey(windowStart);
  const windowEndStr = toDateKey(windowEnd);

  const todayInWindow = inWindow(todayDate, windowStart, windowEnd);
  const upcomingFrom = todayInWindow ? tomorrow : windowStartStr;
  const upcomingTo = windowEndStr;
  const upcomingVisible = new Date(upcomingFrom + 'T00:00:00') <= windowEnd;

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
        <section className="mb-6">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400">
              {t('actionNeededTitle')}
            </h2>
            <div className="h-px flex-1 bg-gray-200" />
            {!!actionNeeded?.items.length && (
              <span className="text-[0.6875rem] font-bold text-gray-400">
                {t('bookingCount', { count: actionNeeded.items.length })}
              </span>
            )}
          </div>
          {actionNeeded?.items.length ? (
            actionNeeded.items.map((b) => (
              <BookingCard
                key={b.bookingId}
                booking={b}
                variant="action-needed"
                onApprove={() =>
                  void approveBookingMutation.mutateAsync({ id: b.bookingId }).catch(() => {
                    return undefined;
                  })
                }
                isApproving={approveBookingMutation.isPending}
              />
            ))
          ) : (
            <p className="text-sm text-gray-400">{t('emptyActionNeeded')}</p>
          )}
        </section>

        {todayInWindow && (
          <section className="mb-6">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400">
                {t('todayTitle')}
              </h2>
              <div className="h-px flex-1 bg-gray-200" />
              {!!todayData?.items.length && (
                <span className="text-[0.6875rem] font-bold text-gray-400">
                  {t('bookingCount', { count: todayData.items.length })}
                </span>
              )}
            </div>
            {todayData?.items.length ? (
              todayData.items.map((b) => (
                <BookingCard key={b.bookingId} booking={b} variant="today" />
              ))
            ) : (
              <p className="text-sm text-gray-400">{t('emptyToday')}</p>
            )}
          </section>
        )}

        {upcomingVisible && (
          <section className="mb-6">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400">
                {selectedUpcomingDate
                  ? t('upcomingTitleFiltered', {
                      date: `${selectedUpcomingDate.slice(8, 10)}/${selectedUpcomingDate.slice(5, 7)}`,
                    })
                  : t('upcomingTitle')}
              </h2>
              <div className="h-px flex-1 bg-gray-200" />
              {!!upcomingItems.length && (
                <span className="text-[0.6875rem] font-bold text-gray-400">
                  {t('bookingCount', { count: upcomingItems.length })}
                </span>
              )}
            </div>
            {upcomingItems.length ? (
              upcomingItems.map((b) => (
                <BookingCard
                  key={b.bookingId}
                  booking={b}
                  variant="upcoming"
                  emphasized={!!selectedUpcomingDate}
                />
              ))
            ) : (
              <p className="text-sm text-gray-400">
                {selectedUpcomingDate ? t('emptyUpcomingFiltered') : t('emptyUpcoming')}
              </p>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
