import { getAccessToken } from '@/features/auth/get-access-token';
import { withAuthRedirect } from '@/features/customer/api.server';
import { fetchCustomerRecurringSchedules } from '@/features/booking/api/recurring-booking-schedules.server';
import { RecurringScheduleList } from '@/features/customer/components/my-account/RecurringScheduleList';

interface RecurringSchedulesPageProps {
  readonly params: Promise<{ readonly slug: string }>;
}

export default async function RecurringSchedulesPage({
  params,
}: RecurringSchedulesPageProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const token = await getAccessToken();
  const schedules = await withAuthRedirect(fetchCustomerRecurringSchedules(token), slug);

  return <RecurringScheduleList schedules={schedules.items} tenantSlug={slug} />;
}
