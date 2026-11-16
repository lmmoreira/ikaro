import { redirect } from 'next/navigation';
import { getAccessToken } from '@/features/auth/get-access-token';
import { fetchCustomerBookingDetailOrRedirect } from '@/features/booking/api/customer.server';
import { appendReturnTo, resolveReturnTo } from '@/features/customer/booking-navigation';
import { CustomerReschedulePage } from '@/features/customer/components/my-account/CustomerReschedulePage';
import { fetchManifest } from '@/features/platform/api.server';
import { fetchCustomerTenantOperational } from '@/shared/lib/billing/access.server';

interface RescheduleRouteProps {
  readonly params: Promise<{ readonly slug: string; readonly id: string }>;
  readonly searchParams: Promise<{ readonly returnTo?: string }>;
}

export default async function RescheduleRoute({
  params,
  searchParams,
}: RescheduleRouteProps): Promise<React.JSX.Element> {
  const { slug, id } = await params;
  const { returnTo } = await searchParams;
  const token = await getAccessToken();
  const [booking, operational] = await Promise.all([
    fetchCustomerBookingDetailOrRedirect(token, id, slug),
    fetchCustomerTenantOperational(token),
  ]);
  const resolvedReturnTo = resolveReturnTo(returnTo, slug);

  // A suspended tenant refuses the reschedule (UC-121): the detail, which stays readable, is the
  // place to land, not a picker whose submit would be denied.
  if (operational === false || booking.reschedule === null || booking.scheduledAt === null) {
    redirect(appendReturnTo(`/${slug}/my-account/bookings/${id}`, resolvedReturnTo));
  }

  const manifest = await fetchManifest(slug).catch(() => null);
  const whatsapp = manifest?.business.socialLinks?.whatsapp ?? null;

  return (
    <CustomerReschedulePage
      booking={booking}
      reschedule={booking.reschedule}
      scheduledAt={booking.scheduledAt}
      tenantSlug={slug}
      whatsapp={whatsapp}
      returnTo={resolvedReturnTo}
    />
  );
}
