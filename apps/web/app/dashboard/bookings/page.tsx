import { BookingQueuePage } from '@/features/booking/components/dashboard/bookings/BookingQueuePage';
import { getAccessToken } from '@/features/auth/get-access-token';
import { listBookings } from '@/features/booking/api/booking.server';
import { resolveBookingQueueWindow } from '@/features/booking/model/booking-queue-window';
import { fetchTenantSettings } from '@/features/platform/api/tenant-settings.server';
import { resolveWelcomeStaffScreenDays } from '@/features/platform/model/tenant-settings';

export default async function BookingsPage(): Promise<React.JSX.Element> {
  const token = await getAccessToken();

  // No fallback on failure: without the tenant's timezone there is no correct "today", and a
  // silent UTC guess is exactly the wrong-day bug this page must not have (same as the schedule page).
  const tenantSettings = await fetchTenantSettings(token);
  const welcomeStaffScreenDays = resolveWelcomeStaffScreenDays(tenantSettings);

  const { today, tomorrow, windowEnd } = resolveBookingQueueWindow({
    now: new Date(),
    timezone: tenantSettings.settings.businessHours.timezone,
    windowDays: welcomeStaffScreenDays,
  });

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
