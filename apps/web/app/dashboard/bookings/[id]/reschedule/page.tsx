import { cookies } from 'next/headers';
import { RescheduleBookingPage } from '@/components/dashboard/bookings/RescheduleBookingPage';
import { loadBookingDetailRouteData } from '@/lib/dashboard/booking-route';

interface BookingRescheduleRouteProps {
  readonly params: Promise<{ id: string }>;
}

export default async function BookingRescheduleRoute({
  params,
}: BookingRescheduleRouteProps): Promise<React.JSX.Element> {
  const { id } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get('access_token')?.value ?? '';
  const { booking, tenantSlug } = await loadBookingDetailRouteData(token, id);

  return (
    <RescheduleBookingPage
      booking={booking}
      tenantSlug={tenantSlug}
      backHref={`/dashboard/bookings/${id}`}
    />
  );
}
