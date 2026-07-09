import { BookingQueuePage } from '@/features/booking/components/dashboard/bookings/BookingQueuePage';
import { getAccessToken } from '@/features/auth/get-access-token';
import { listBookings } from '@/features/booking/api/staff.server';
import { resolveWelcomeStaffScreenDays } from '@/features/platform/tenant-settings.shared';
import { fetchTenantSettings } from '@/features/platform/tenant-settings.server';
import { addDays, toDateKey } from '@/shared/utils/date-utils';

export default async function BookingsPage(): Promise<React.JSX.Element> {
  const token = await getAccessToken();

  const tenantSettings = await fetchTenantSettings(token).catch(() => null);
  const welcomeStaffScreenDays = tenantSettings
    ? resolveWelcomeStaffScreenDays(tenantSettings)
    : 14;

  const now = new Date();
  const today = toDateKey(now);
  const tomorrow = toDateKey(addDays(now, 1));
  const windowEnd = toDateKey(addDays(now, welcomeStaffScreenDays - 1));

  const [actionNeeded, todayBookings, upcoming] = await Promise.all([
    listBookings(token, { status: 'PENDING,INFO_REQUESTED', from: today, to: windowEnd }),
    listBookings(token, { status: 'APPROVED', date: today }),
    listBookings(token, { status: 'APPROVED', from: tomorrow, to: windowEnd }),
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
