import { getAccessToken } from '@/features/auth/get-access-token';
import { listAllBookings } from '@/features/booking/api/booking.server';
import {
  fetchScheduleClosures,
  fetchScheduleOpenings,
} from '@/features/booking/api/schedule.server';
import { fetchTenantSettings } from '@/features/platform/api/tenant-settings.server';
import { SchedulePage } from '@/features/booking/components/dashboard/schedule/SchedulePage';
import { SCHEDULE_BOOKING_STATUS_ALL } from '@/features/booking/model/booking-status';
import {
  getWeekBookingsFetchStartKey,
  getWeekEndKey,
  getWeekStartKey,
  isValidDateKey,
} from '@/features/booking/schedule/date-utils';
import { toISODateInTimezone } from '@/shared/lib/formatting/date-utils';

interface ScheduleRouteProps {
  readonly searchParams: Promise<{ weekStart?: string; date?: string }>;
}

export default async function ScheduleRoute({
  searchParams,
}: ScheduleRouteProps): Promise<React.JSX.Element> {
  const token = await getAccessToken();
  const tenantSettings = await fetchTenantSettings(token);
  const timezone = tenantSettings.settings.businessHours.timezone;
  const todayKey = toISODateInTimezone(new Date(), timezone);
  const { weekStart, date } = await searchParams;
  const selectedDateKey = date && isValidDateKey(date) ? date : todayKey;
  const weekStartKey =
    weekStart && isValidDateKey(weekStart)
      ? getWeekStartKey(weekStart)
      : getWeekStartKey(selectedDateKey);
  const weekEndKey = getWeekEndKey(weekStartKey);
  const slotGranularityMinutes = tenantSettings.settings.booking.slotGranularityMinutes;

  const [initialClosures, initialOpenings, initialBookings] = await Promise.all([
    fetchScheduleClosures(token, weekStartKey, weekEndKey),
    fetchScheduleOpenings(token, weekStartKey, weekEndKey),
    listAllBookings(token, {
      status: SCHEDULE_BOOKING_STATUS_ALL,
      from: getWeekBookingsFetchStartKey(weekStartKey),
      to: weekEndKey,
    }),
  ]);

  return (
    <SchedulePage
      initialClosures={initialClosures}
      initialOpenings={initialOpenings}
      initialBookings={initialBookings}
      businessHours={tenantSettings.settings.businessHours}
      todayKey={todayKey}
      weekStartKey={weekStartKey}
      initialSelectedDateKey={selectedDateKey}
      slotGranularityMinutes={slotGranularityMinutes}
    />
  );
}
