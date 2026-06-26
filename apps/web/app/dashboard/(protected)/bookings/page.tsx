import { cookies } from 'next/headers';
import { BookingQueuePage } from '@/components/dashboard/bookings/BookingQueuePage';
import { listBookings } from '@/lib/api/dashboard/bookings';
import { fetchTenantFormatting } from '@/lib/api/dashboard/tenants';
import { addDays, toDateKey } from '@/lib/utils/date-utils';

export default async function BookingsPage(): Promise<React.JSX.Element> {
  const cookieStore = await cookies();
  const token = cookieStore.get('access_token')?.value ?? '';

  const formatting = await fetchTenantFormatting(token).catch(() => null);
  const welcomeStaffScreenDays = formatting?.welcomeStaffScreenDays ?? 14;

  const now = new Date();
  const today = toDateKey(now);
  const tomorrow = toDateKey(addDays(now, 1));
  const windowEnd = toDateKey(addDays(now, welcomeStaffScreenDays - 1));

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
      welcomeStaffScreenDays={welcomeStaffScreenDays}
    />
  );
}
