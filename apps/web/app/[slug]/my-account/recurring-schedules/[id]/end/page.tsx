import { redirect } from 'next/navigation';
import { getAccessToken } from '@/features/auth/get-access-token';
import { fetchCustomerRecurringScheduleOrRedirect } from '@/features/booking/api/recurring-booking-schedules.server';
import { RecurringScheduleEndConfirm } from '@/features/customer/components/my-account/RecurringScheduleEndConfirm';
import { recurringScheduleDetailPath } from '@/features/customer/recurring-schedule-model';

interface EndRecurringScheduleRouteProps {
  readonly params: Promise<{ readonly slug: string; readonly id: string }>;
}

export default async function EndRecurringScheduleRoute({
  params,
}: EndRecurringScheduleRouteProps): Promise<React.JSX.Element> {
  const { slug, id } = await params;
  const token = await getAccessToken();
  const schedule = await fetchCustomerRecurringScheduleOrRedirect(token, id, slug);

  // Only a running schedule can be ended — anything else goes back to its read-only page.
  if (schedule.status !== 'ACTIVE') redirect(recurringScheduleDetailPath(slug, id));

  return <RecurringScheduleEndConfirm schedule={schedule} tenantSlug={slug} />;
}
