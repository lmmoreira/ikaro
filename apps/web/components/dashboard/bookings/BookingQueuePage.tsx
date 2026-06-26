'use client';

import { useState } from 'react';
import type { StaffBookingListResponse } from '@ikaro/types';
import { WeekNav } from '@/components/dashboard/WeekNav';
import { useActionNeededBookings, useTodayBookings, useUpcomingBookings } from '@/lib/hooks/useBookings';
import { BookingCard } from './BookingCard';

export interface BookingQueuePageProps {
  readonly initialActionNeeded?: StaffBookingListResponse;
  readonly initialToday?: StaffBookingListResponse;
  readonly initialUpcoming?: StaffBookingListResponse;
  readonly today: string;
  readonly tomorrow: string;
}

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function shiftWeeks(date: Date, weeks: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + weeks * 7);
  return d;
}

export function BookingQueuePage({
  initialActionNeeded,
  initialToday,
  initialUpcoming,
  today,
  tomorrow,
}: BookingQueuePageProps): React.JSX.Element {
  const [weekStart, setWeekStart] = useState(() => getMondayOfWeek(new Date()));

  const { data: actionNeeded } = useActionNeededBookings(initialActionNeeded);
  const { data: todayData } = useTodayBookings(today, initialToday);
  const { data: upcoming } = useUpcomingBookings(tomorrow, initialUpcoming);

  return (
    <div className="mx-auto max-w-5xl px-4 pb-10 pt-4">
      <WeekNav
        startOfWeek={weekStart}
        onPrev={() => { setWeekStart(w => shiftWeeks(w, -1)); }}
        onNext={() => { setWeekStart(w => shiftWeeks(w, 1)); }}
      />

      <section className="mb-6 mt-4">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Precisa de ação
        </h2>
        {actionNeeded?.items.length ? (
          actionNeeded.items.map(b => (
            <BookingCard key={b.bookingId} booking={b} variant="action-needed" />
          ))
        ) : (
          <p className="text-sm text-gray-400">Nenhum agendamento precisa de ação.</p>
        )}
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Hoje</h2>
        {todayData?.items.length ? (
          todayData.items.map(b => (
            <BookingCard key={b.bookingId} booking={b} variant="today" />
          ))
        ) : (
          <p className="text-sm text-gray-400">Nenhum agendamento confirmado para hoje.</p>
        )}
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Próximos dias
        </h2>
        {upcoming?.items.length ? (
          upcoming.items.map(b => (
            <BookingCard key={b.bookingId} booking={b} variant="upcoming" />
          ))
        ) : (
          <p className="text-sm text-gray-400">Nenhum agendamento confirmado nos próximos dias.</p>
        )}
      </section>
    </div>
  );
}
