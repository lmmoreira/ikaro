import { BookingDetailPage } from '@/features/booking/components/dashboard/bookings/BookingDetailPage';
import { getAccessToken } from '@/features/auth/get-access-token';
import { loadBookingDetailRouteData } from '@/shells/dashboard/model/booking-route.server';

interface BookingDetailRouteProps {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<{ conflict?: string }>;
}

export default async function BookingDetailRoute({
  params,
  searchParams,
}: BookingDetailRouteProps): Promise<React.JSX.Element> {
  const { id } = await params;
  const { conflict } = await searchParams;
  const token = await getAccessToken();
  const { booking, tenantSlug } = await loadBookingDetailRouteData(token, id);

  return (
    <BookingDetailPage
      booking={booking}
      tenantSlug={tenantSlug}
      showHeaderStatusBadge={false}
      initialActionState={conflict === '1' ? 'slot-conflict' : 'idle'}
    />
  );
}
