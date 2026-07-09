import { MarkCompleteBookingPage } from '@/features/booking/components/dashboard/bookings/MarkCompleteBookingPage';
import { getAccessToken } from '@/features/auth/get-access-token';
import { resolveReturnTo } from '@/features/booking/model/booking-navigation';
import { fetchTenantSettings } from '@/features/platform/api/tenant-settings.server';
import { loadBookingDetailRouteData } from '@/shells/dashboard/model/booking-route.server';

interface BookingCompleteRouteProps {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<{ returnTo?: string }>;
}

export default async function BookingCompleteRoute({
  params,
  searchParams,
}: BookingCompleteRouteProps): Promise<React.JSX.Element> {
  const { id } = await params;
  const { returnTo } = await searchParams;
  const token = await getAccessToken();
  const [routeData, tenantSettings] = await Promise.all([
    loadBookingDetailRouteData(token, id),
    fetchTenantSettings(token),
  ]);
  const { booking, tenantSlug } = routeData;
  const returnHref = resolveReturnTo(returnTo);
  const agendaHref = returnHref ?? '/dashboard/bookings';

  return (
    <MarkCompleteBookingPage
      booking={booking}
      tenantSlug={tenantSlug}
      backHref={agendaHref}
      pointsPerCurrencyUnit={tenantSettings.settings.loyalty.pointsPerCurrencyUnit}
    />
  );
}
