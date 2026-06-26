import { cookies } from 'next/headers';
import { BookingQueuePage } from '@/components/dashboard/bookings/BookingQueuePage';
import { listBookings } from '@/lib/api/dashboard/bookings';
import { fetchTenantBookingConfig } from '@/lib/api/dashboard/tenants';
import { addDays, toDateKey } from '@/lib/utils/date-utils';

export default async function BookingsPage(): Promise<React.JSX.Element> {
  const cookieStore = await cookies();
  const token = cookieStore.get('access_token')?.value ?? '';

  const bookingConfig = await fetchTenantBookingConfig(token).catch(() => ({
    welcomeStaffScreenDays: 14,
  }));
  const welcomeStaffScreenDays = bookingConfig.welcomeStaffScreenDays;

  const now = new Date();
  const today = toDateKey(now);
  const tomorrow = toDateKey(addDays(now, 1));
  const windowEnd = toDateKey(addDays(now, welcomeStaffScreenDays - 1));

  const [actionNeeded, todayBookings, upcoming] = await Promise.all([
    listBookings({ status: 'PENDING,INFO_REQUESTED', from: today, to: windowEnd }, token),
    listBookings({ status: 'APPROVED', date: today }, token),
    listBookings({ status: 'APPROVED', from: tomorrow, to: windowEnd }, token),
  ]);

  return (
    <BookingQueuePage
      initialActionNeeded={actionNeeded}
      initialToday={todayBookings}
      initialUpcoming={upcoming}
      today={today}
      tomorrow={tomorrow}
      welcomeStaffScreenDays={welcomeStaffScreenDays}
    />
  );
}
