import { getAccessToken } from '@/features/auth/get-access-token';
import { fetchCustomerBookingDetailOrRedirect } from '@/features/booking/api/customer.server';
import { resolveReturnTo } from '@/features/customer/booking-navigation';
import { BookingDetailPage } from '@/features/customer/components/my-account/BookingDetailPage';
import {
  fetchCustomerTenantOperational,
  redirectCustomerWithoutFeature,
} from '@/shared/lib/billing/access.server';

interface BookingDetailRouteProps {
  readonly params: Promise<{ readonly slug: string; readonly id: string }>;
  readonly searchParams: Promise<{ readonly returnTo?: string }>;
}

export default async function BookingDetailRoute({
  params,
  searchParams,
}: BookingDetailRouteProps): Promise<React.JSX.Element> {
  const { slug, id } = await params;
  const { returnTo } = await searchParams;
  const token = await getAccessToken();
  // A tenant without `BOOKING` has no booking pages: back to Início before any read, which the
  // backend would refuse. A suspended tenant keeps this page readable (UC-121): the helper reads
  // the feature list as unknown while the tenant is not operational.
  await redirectCustomerWithoutFeature(token, slug, 'BOOKING');
  const [booking, operational] = await Promise.all([
    fetchCustomerBookingDetailOrRedirect(token, id, slug),
    fetchCustomerTenantOperational(token),
  ]);

  return (
    <BookingDetailPage
      booking={booking}
      tenantSlug={slug}
      returnTo={resolveReturnTo(returnTo, slug)}
      tenantOperational={operational !== false}
    />
  );
}
