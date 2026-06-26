'use client';

import { useState, useMemo } from 'react';
import type { StaffBookingListResponse } from '@ikaro/types';
import { WeekNav } from '@/components/dashboard/WeekNav';
import {
  useActionNeededBookings,
  useTodayBookings,
  useUpcomingBookings,
} from '@/lib/hooks/useBookings';
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
  const windowDays = welcomeStaffScreenDays;

  const todayDate = useMemo(() => new Date(today + 'T00:00:00'), [today]);

  const [windowStart, setWindowStart] = useState(() => todayDate);
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

  return (
    <div>
      <WeekNav
        windowStart={windowStart}
        windowDays={windowDays}
        today={todayDate}
        onPrev={() => setWindowStart((w) => addDays(w, -windowDays))}
        onNext={() => setWindowStart((w) => addDays(w, windowDays))}
        disablePrev={false}
        activeDates={activeDates}
      />

      <div className="p-4">
        <section className="mb-6">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400">
              Precisa de ação
            </h2>
            <div className="h-px flex-1 bg-gray-200" />
            {!!actionNeeded?.items.length && (
              <span className="text-[0.6875rem] font-bold text-gray-400">
                {actionNeeded.items.length} agendamento
                {actionNeeded.items.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          {actionNeeded?.items.length ? (
            actionNeeded.items.map((b) => (
              <BookingCard key={b.bookingId} booking={b} variant="action-needed" />
            ))
          ) : (
            <p className="text-sm text-gray-400">Nenhum agendamento precisa de ação.</p>
          )}
        </section>

        {todayInWindow && (
          <section className="mb-6">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400">
                Hoje — confirmados
              </h2>
              <div className="h-px flex-1 bg-gray-200" />
              {!!todayData?.items.length && (
                <span className="text-[0.6875rem] font-bold text-gray-400">
                  {todayData.items.length} agendamento{todayData.items.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            {todayData?.items.length ? (
              todayData.items.map((b) => (
                <BookingCard key={b.bookingId} booking={b} variant="today" />
              ))
            ) : (
              <p className="text-sm text-gray-400">Nenhum agendamento confirmado para hoje.</p>
            )}
          </section>
        )}

        {upcomingVisible && (
          <section className="mb-6">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400">
                Próximos dias — confirmados
              </h2>
              <div className="h-px flex-1 bg-gray-200" />
              {!!upcoming?.items.length && (
                <span className="text-[0.6875rem] font-bold text-gray-400">
                  {upcoming.items.length} agendamento{upcoming.items.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            {upcoming?.items.length ? (
              upcoming.items.map((b) => (
                <BookingCard key={b.bookingId} booking={b} variant="upcoming" />
              ))
            ) : (
              <p className="text-sm text-gray-400">
                Nenhum agendamento confirmado nos próximos dias.
              </p>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
