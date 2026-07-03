import { BookingDetailPage } from '@/features/booking/components/dashboard/bookings/BookingDetailPage';
import { getAccessToken } from '@/features/auth/get-access-token';
import { loadBookingDetailRouteData } from '@/shells/dashboard/model/booking-route.server';

interface BookingDetailRouteProps {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<{ conflict?: string; returnTo?: string }>;
}

function resolveReturnTo(returnTo: string | undefined): string | null {
  if (typeof returnTo !== 'string') return null;
  return returnTo.startsWith('/dashboard/') ? returnTo : null;
}

export default async function BookingDetailRoute({
  params,
  searchParams,
}: BookingDetailRouteProps): Promise<React.JSX.Element> {
  const { id } = await params;
  const { conflict, returnTo } = await searchParams;
  const token = await getAccessToken();
  const { booking, tenantSlug } = await loadBookingDetailRouteData(token, id);

  return (
    <BookingDetailPage
      booking={booking}
      tenantSlug={tenantSlug}
      showHeaderStatusBadge={false}
      initialActionState={conflict === '1' ? 'slot-conflict' : 'idle'}
      returnTo={resolveReturnTo(returnTo)}
    />
  );
}
