import { cookies } from 'next/headers';
import { BookingQueuePage } from '@/components/dashboard/bookings/BookingQueuePage';
import { listBookings } from '@/lib/api/dashboard/bookings';

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export default async function BookingsPage(): Promise<React.JSX.Element> {
  const cookieStore = await cookies();
  const token = cookieStore.get('access_token')?.value ?? '';

  const today = formatDate(new Date());
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = formatDate(tomorrowDate);

  // SSR uses 14-day default; client reads welcomeStaffScreenDays from FormattingContext
  const windowEndDate = new Date();
  windowEndDate.setDate(windowEndDate.getDate() + 13);
  const windowEnd = formatDate(windowEndDate);

  const [actionNeeded, todayBookings, upcoming] = await Promise.all([
    listBookings({ status: 'PENDING,INFO_REQUESTED', from: today, to: windowEnd }, token).catch(
      () => undefined,
    ),
    listBookings({ status: 'APPROVED', date: today }, token).catch(() => undefined),
    listBookings({ status: 'APPROVED', from: tomorrow, to: windowEnd }, token).catch(
      () => undefined,
    ),
  ]);

  return (
    <BookingQueuePage
      initialActionNeeded={actionNeeded}
      initialToday={todayBookings}
      initialUpcoming={upcoming}
      today={today}
      tomorrow={tomorrow}
    />
  );
}
