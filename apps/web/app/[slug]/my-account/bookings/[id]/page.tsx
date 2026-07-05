import { getAccessToken } from '@/features/auth/get-access-token';
import { fetchCustomerBookingDetailOrRedirect } from '@/features/customer/api.server';
import { resolveReturnTo } from '@/features/customer/booking-navigation';
import { BookingDetailPage } from '@/features/customer/components/my-account/BookingDetailPage';

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
  const booking = await fetchCustomerBookingDetailOrRedirect(token, id, slug);

  return (
    <BookingDetailPage
      booking={booking}
      tenantSlug={slug}
      returnTo={resolveReturnTo(returnTo, slug)}
    />
  );
}
