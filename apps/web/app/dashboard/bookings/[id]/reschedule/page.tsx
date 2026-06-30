import { RescheduleBookingPage } from '@/components/dashboard/bookings/RescheduleBookingPage';
import { getAccessToken } from '@/lib/auth/get-access-token';
import { loadBookingDetailRouteData } from '@/lib/dashboard/booking-route.server';

interface BookingRescheduleRouteProps {
  readonly params: Promise<{ id: string }>;
}

export default async function BookingRescheduleRoute({
  params,
}: BookingRescheduleRouteProps): Promise<React.JSX.Element> {
  const { id } = await params;
  const token = await getAccessToken();
  const { booking, tenantSlug } = await loadBookingDetailRouteData(token, id);

  return (
    <RescheduleBookingPage
      booking={booking}
      tenantSlug={tenantSlug}
      backHref={`/dashboard/bookings/${id}`}
    />
  );
}
