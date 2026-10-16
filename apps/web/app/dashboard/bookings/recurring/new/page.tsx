import { redirect } from 'next/navigation';
import { getAccessToken } from '@/features/auth/get-access-token';
import { decodeJwtPayload } from '@/features/auth/decode-jwt';
import { NewRecurringScheduleForStaff } from '@/features/booking/components/dashboard/bookings/NewRecurringScheduleForStaff';
import {
  filterRecurrenceEligibleServices,
  noRecurrenceServicesReason,
} from '@/features/booking/model/recurring-service-eligibility';
import { fetchCustomerProfileForStaff } from '@/features/customer/api.server';
import { fetchServices } from '@/features/platform/hotsite/api/services.server';

interface NewRecurringScheduleRouteProps {
  readonly searchParams: Promise<{ readonly customerId?: string }>;
}

// UC-070 (M23-S19): the pattern for the customer chosen on `/dashboard/bookings/new?tipo=recorrencia`.
// A recurrence needs a registered customer, so a missing or unknown `?customerId=` goes back to the
// chooser. Two segments after `/dashboard/bookings/`, so it is never read as a booking id.
export default async function NewRecurringScheduleRoute({
  searchParams,
}: NewRecurringScheduleRouteProps): Promise<React.JSX.Element> {
  const { customerId } = await searchParams;
  if (!customerId) redirect('/dashboard/bookings/new?tipo=recorrencia');

  const token = await getAccessToken();
  const { tenantSlug } = decodeJwtPayload(token);
  const slug = tenantSlug ?? '';

  const [allServices, customer] = await Promise.all([
    fetchServices(slug),
    fetchCustomerProfileForStaff(token, customerId),
  ]);
  if (!customer) redirect('/dashboard/bookings/new?tipo=recorrencia');

  return (
    <NewRecurringScheduleForStaff
      services={filterRecurrenceEligibleServices(allServices)}
      emptyReason={noRecurrenceServicesReason(allServices)}
      tenantSlug={slug}
      customer={{ customerId: customer.customerId, name: customer.name, email: customer.email }}
    />
  );
}
