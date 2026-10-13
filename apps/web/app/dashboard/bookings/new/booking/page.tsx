import { redirect } from 'next/navigation';
import { getAccessToken } from '@/features/auth/get-access-token';
import { decodeJwtPayload } from '@/features/auth/decode-jwt';
import { NewBookingForStaffPage } from '@/features/booking/components/dashboard/bookings/NewBookingForStaffPage';
import { fetchCustomerProfileForStaff } from '@/features/customer/api.server';
import { fetchManifest } from '@/features/platform/api.server';
import { fetchServices } from '@/features/platform/hotsite/api/services.server';

interface NewBookingStepsRouteProps {
  readonly searchParams: Promise<{ customerId?: string }>;
}

// UC-108: the booking steps for the person chosen on the previous page — a registered customer
// (`?customerId=`, fetched here for the name and the saved pickup address) or a new contact, which
// lives in the browser's memory only and is read by the page itself.
export default async function NewBookingStepsRoute({
  searchParams,
}: NewBookingStepsRouteProps): Promise<React.JSX.Element> {
  const { customerId } = await searchParams;
  const token = await getAccessToken();
  const { tenantSlug } = decodeJwtPayload(token);
  const slug = tenantSlug ?? '';

  const [manifest, services, customer] = await Promise.all([
    fetchManifest(slug),
    fetchServices(slug),
    customerId ? fetchCustomerProfileForStaff(token, customerId) : Promise.resolve(null),
  ]);
  if (customerId && !customer) redirect('/dashboard/bookings/new');

  return (
    <NewBookingForStaffPage
      slug={slug}
      services={services}
      timezone={manifest.localization.timezone}
      maxBookingAdvanceDays={manifest.booking?.maxBookingAdvanceDays ?? 90}
      addressSpec={manifest.localization.address}
      customer={customer}
    />
  );
}
