import { getAccessToken } from '@/features/auth/get-access-token';
import { fetchCustomerBookingDetailOrRedirect } from '@/features/booking/api/customer.server';
import { resolveReturnTo } from '@/features/customer/booking-navigation';
import { BookingDetailPage } from '@/features/customer/components/my-account/BookingDetailPage';
import { fetchCustomerTenantOperational } from '@/shared/lib/billing/access.server';

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
