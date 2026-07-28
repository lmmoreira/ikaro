import { RescheduleBookingPage } from '@/features/booking/components/dashboard/bookings/RescheduleBookingPage';
import { getAccessToken } from '@/features/auth/get-access-token';
import { appendReturnTo, resolveReturnTo } from '@/features/booking/model/booking-navigation';
import { loadBookingDetailRouteData } from '@/shells/dashboard/model/booking-route.server';
import { fetchTenantSettings } from '@/features/platform/api/tenant-settings.server';

interface BookingRescheduleRouteProps {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<{ returnTo?: string }>;
}

export default async function BookingRescheduleRoute({
  params,
  searchParams,
}: BookingRescheduleRouteProps): Promise<React.JSX.Element> {
  const { id } = await params;
  const { returnTo } = await searchParams;
  const token = await getAccessToken();
  const [{ booking, tenantSlug }, settings] = await Promise.all([
    loadBookingDetailRouteData(token, id),
    fetchTenantSettings(token),
  ]);
  const returnHref = resolveReturnTo(returnTo);
  const agendaHref = returnHref ?? '/dashboard/bookings';

  return (
    <RescheduleBookingPage
      booking={booking}
      tenantSlug={tenantSlug}
      maxBookingAdvanceDays={settings.settings.booking.maxBookingAdvanceDays}
      backHref={appendReturnTo(`/dashboard/bookings/${id}`, returnHref)}
      agendaHref={agendaHref}
    />
  );
}
