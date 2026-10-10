import { filterRecurrenceEligibleServices } from '@/features/booking/model/recurring-schedule-form';
import { NewRecurringSchedulePage } from '@/features/customer/components/my-account/NewRecurringSchedulePage';
import { fetchServices } from '@/features/platform/hotsite/api/services.server';

interface NewRecurringScheduleRouteProps {
  readonly params: Promise<{ readonly slug: string }>;
}

export default async function NewRecurringScheduleRoute({
  params,
}: NewRecurringScheduleRouteProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const services = filterRecurrenceEligibleServices(await fetchServices(slug));

  return <NewRecurringSchedulePage services={services} tenantSlug={slug} />;
}
