import { cookies } from 'next/headers';
import { MarkCompleteBookingPage } from '@/components/dashboard/bookings/MarkCompleteBookingPage';
import { fetchTenantSettings } from '@/lib/api/dashboard/tenants';
import { loadBookingDetailRouteData } from '@/lib/dashboard/booking-route.server';

interface BookingCompleteRouteProps {
  readonly params: Promise<{ id: string }>;
}

export default async function BookingCompleteRoute({
  params,
}: BookingCompleteRouteProps): Promise<React.JSX.Element> {
  const { id } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get('access_token')?.value ?? '';
  const [routeData, tenantSettings] = await Promise.all([
    loadBookingDetailRouteData(token, id),
    fetchTenantSettings(token),
  ]);
  const { booking, tenantSlug } = routeData;

  return (
    <MarkCompleteBookingPage
      booking={booking}
      tenantSlug={tenantSlug}
      backHref="/dashboard/bookings"
      pointsPerCurrencyUnit={tenantSettings.settings.loyalty.pointsPerCurrencyUnit}
    />
  );
}
