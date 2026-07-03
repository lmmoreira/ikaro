import { getAccessToken } from '@/features/auth/get-access-token';
import { fetchTenantSettings } from '@/features/platform/tenant-settings';
import { listBookings } from '@/features/booking/api/staff';
import { fetchScheduleClosures, fetchScheduleOpenings } from '@/features/booking/schedule/api';
import { SchedulePage } from '@/features/booking/components/dashboard/schedule/SchedulePage';
import { SCHEDULE_BOOKING_STATUS_ALL } from '@/features/booking/model/booking-status';
import { getWeekEndKey, getWeekStartKey } from '@/features/booking/schedule/date-utils';
import { toDateKeyInTimezone } from '@/shared/utils/date-utils';

interface ScheduleRouteProps {
  readonly searchParams: Promise<{ weekStart?: string; date?: string }>;
}

function isDateKey(value: string | undefined): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export default async function ScheduleRoute({
  searchParams,
}: ScheduleRouteProps): Promise<React.JSX.Element> {
  const token = await getAccessToken();
  const tenantSettings = await fetchTenantSettings(token);
  const timezone = tenantSettings.settings.businessHours.timezone;
  const todayKey = toDateKeyInTimezone(new Date(), timezone);
  const { weekStart, date } = await searchParams;
  const selectedDateKey = isDateKey(date) ? date : todayKey;
  const weekStartKey = isDateKey(weekStart)
    ? getWeekStartKey(weekStart)
    : getWeekStartKey(selectedDateKey);
  const weekEndKey = getWeekEndKey(weekStartKey);
  const slotGranularityMinutes = tenantSettings.settings.booking.slotGranularityMinutes;

  const [initialClosures, initialOpenings, initialBookings] = await Promise.all([
    fetchScheduleClosures(token, weekStartKey, weekEndKey),
    fetchScheduleOpenings(token, weekStartKey, weekEndKey),
    listBookings(
      { status: SCHEDULE_BOOKING_STATUS_ALL, from: weekStartKey, to: weekEndKey, limit: 100 },
      token,
    ),
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
