import { RescheduleBookingPage } from '@/features/booking/components/dashboard/bookings/RescheduleBookingPage';
import { getAccessToken } from '@/features/auth/get-access-token';
import { loadBookingDetailRouteData } from '@/shells/dashboard/model/booking-route.server';

interface BookingRescheduleRouteProps {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<{ returnTo?: string }>;
}

function resolveReturnTo(returnTo: string | undefined): string | null {
  if (typeof returnTo !== 'string') return null;
  return returnTo.startsWith('/dashboard/') ? returnTo : null;
}

export default async function BookingRescheduleRoute({
  params,
  searchParams,
}: BookingRescheduleRouteProps): Promise<React.JSX.Element> {
  const { id } = await params;
  const { returnTo } = await searchParams;
  const token = await getAccessToken();
  const { booking, tenantSlug } = await loadBookingDetailRouteData(token, id);
  const returnHref = resolveReturnTo(returnTo);
  const agendaHref = returnHref ?? '/dashboard/bookings';

  return (
    <RescheduleBookingPage
      booking={booking}
      tenantSlug={tenantSlug}
      backHref={
        returnHref
          ? `/dashboard/bookings/${id}?returnTo=${encodeURIComponent(returnHref)}`
          : `/dashboard/bookings/${id}`
      }
      agendaHref={agendaHref}
    />
  );
}
