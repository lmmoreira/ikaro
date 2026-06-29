import { cookies } from 'next/headers';
import { MarkCompleteBookingPage } from '@/components/dashboard/bookings/MarkCompleteBookingPage';
import { loadBookingDetailRouteData } from '@/lib/dashboard/booking-route';

interface BookingCompleteRouteProps {
  readonly params: Promise<{ id: string }>;
}

export default async function BookingCompleteRoute({
  params,
}: BookingCompleteRouteProps): Promise<React.JSX.Element> {
  const { id } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get('access_token')?.value ?? '';
  const { booking, tenantSlug } = await loadBookingDetailRouteData(token, id);

  return (
    <MarkCompleteBookingPage
      booking={booking}
      tenantSlug={tenantSlug}
      backHref="/dashboard/bookings"
    />
  );
}
