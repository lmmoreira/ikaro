import { getAccessToken } from '@/features/auth/get-access-token';
import { fetchCustomerBookingDetailOrRedirect } from '@/features/booking/api/customer.server';
import { resolveReturnTo } from '@/features/customer/booking-navigation';
import { BookingDetailPage } from '@/features/customer/components/my-account/BookingDetailPage';
import { CustomerTenantAccessScope } from '@/features/customer/components/CustomerTenantAccessScope';
import { redirectCustomerWithoutFeature } from '@/shared/lib/billing/access.server';

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
  const booking = await fetchCustomerBookingDetailOrRedirect(token, id, slug);

  // The tenant's state is read in this render, not taken from the account layout: a layout is kept
  // across client navigation, so a tenant suspended or reactivated mid-session must show here.
  return (
    <CustomerTenantAccessScope token={token}>
      <BookingDetailPage
        booking={booking}
        tenantSlug={slug}
        returnTo={resolveReturnTo(returnTo, slug)}
      />
    </CustomerTenantAccessScope>
  );
}
