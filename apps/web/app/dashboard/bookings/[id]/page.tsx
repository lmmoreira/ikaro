import { cookies } from 'next/headers';
import { BookingDetailPage } from '@/components/dashboard/bookings/BookingDetailPage';
import { loadBookingDetailRouteData } from '@/lib/dashboard/booking-route.server';

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
  const cookieStore = await cookies();
  const token = cookieStore.get('access_token')?.value ?? '';
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
