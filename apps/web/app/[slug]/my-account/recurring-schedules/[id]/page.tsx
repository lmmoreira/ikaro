import { redirect } from 'next/navigation';
import { getAccessToken } from '@/features/auth/get-access-token';
import { withAuthRedirect } from '@/features/customer/api.server';
import { fetchCustomerBookings } from '@/features/booking/api/customer.server';
import { fetchCustomerRecurringScheduleOrRedirect } from '@/features/booking/api/recurring-booking-schedules.server';
import { RecurringScheduleDetail } from '@/features/customer/components/my-account/RecurringScheduleDetail';
import {
  ACTIVE_OCCURRENCE_STATUS,
  RECURRING_OCCURRENCES_PAGE_SIZE,
  TERMINAL_OCCURRENCE_STATUSES,
  isTerminalRecurringSchedule,
  parseOccurrencePage,
  recurringScheduleDetailPath,
  totalOccurrencePages,
} from '@/features/customer/recurring-schedule-model';
import { fetchManifest } from '@/features/platform/api.server';
import { toISODateInTimezone } from '@/shared/lib/formatting/date-utils';
import { isValidTimezone } from '@/shared/lib/formatting/locale-validators';

interface RecurringScheduleDetailRouteProps {
  readonly params: Promise<{ readonly slug: string; readonly id: string }>;
  readonly searchParams: Promise<{ readonly page?: string }>;
}

export default async function RecurringScheduleDetailRoute({
  params,
  searchParams,
}: RecurringScheduleDetailRouteProps): Promise<React.JSX.Element> {
  const { slug, id } = await params;
  const { page: rawPage } = await searchParams;
  const page = parseOccurrencePage(rawPage);
  const token = await getAccessToken();
  const schedule = await fetchCustomerRecurringScheduleOrRedirect(token, id, slug);

  // A pending schedule has no bookings yet — nothing to list.
  if (schedule.status === 'PENDING_APPROVAL') {
    return <RecurringScheduleDetail schedule={schedule} tenantSlug={slug} occurrences={null} />;
  }

  const terminal = isTerminalRecurringSchedule(schedule.status);
  // "Upcoming" means from the tenant-local today: `from` is a calendar day the backend reads in
  // the tenant's timezone, so the day key must be computed in that same zone.
  const manifest = await fetchManifest(slug);
  const rawTimezone = manifest.localization.timezone;
  const timezone = isValidTimezone(rawTimezone) ? rawTimezone : 'UTC';

  const bookings = await withAuthRedirect(
    fetchCustomerBookings(token, {
      recurringScheduleId: id,
      status: terminal ? TERMINAL_OCCURRENCE_STATUSES : ACTIVE_OCCURRENCE_STATUS,
      ...(terminal ? {} : { from: toISODateInTimezone(new Date(), timezone) }),
      page,
      limit: RECURRING_OCCURRENCES_PAGE_SIZE,
    }),
    slug,
  );

  // Skipping the last occurrence of the last page leaves that page empty — step back to the new last one.
  const lastPage = totalOccurrencePages(bookings.total, RECURRING_OCCURRENCES_PAGE_SIZE);
  if (page > lastPage) redirect(recurringScheduleDetailPath(slug, id, lastPage));

  return (
    <RecurringScheduleDetail
      schedule={schedule}
      tenantSlug={slug}
      occurrences={{
        items: bookings.items,
        total: bookings.total,
        page: bookings.page,
        limit: bookings.limit,
      }}
    />
  );
}
