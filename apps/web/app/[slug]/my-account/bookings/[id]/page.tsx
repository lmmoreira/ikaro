import { notFound, redirect } from 'next/navigation';
import { getAccessToken } from '@/features/auth/get-access-token';
import {
  CustomerBookingDetailFetchError,
  fetchCustomerBookingDetail,
} from '@/features/customer/api.server';
import { BookingDetailPage } from '@/features/customer/components/my-account/BookingDetailPage';

interface BookingDetailRouteProps {
  readonly params: Promise<{ readonly slug: string; readonly id: string }>;
}

export default async function BookingDetailRoute({
  params,
}: BookingDetailRouteProps): Promise<React.JSX.Element> {
  const { slug, id } = await params;
  const token = await getAccessToken();

  let booking;
  try {
    booking = await fetchCustomerBookingDetail(token, id);
  } catch (err) {
    if (err instanceof CustomerBookingDetailFetchError) {
      if (err.status === 404) notFound();
      if (err.status === 401 || err.status === 403) redirect(`/${slug}/login`);
    }
    throw err;
  }

  return <BookingDetailPage booking={booking} tenantSlug={slug} />;
}
