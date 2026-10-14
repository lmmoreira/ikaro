import { getAccessToken } from '@/features/auth/get-access-token';
import { decodeJwtPayload } from '@/features/auth/decode-jwt';
import { withAuthRedirect } from '@/features/customer/api.server';
import { fetchAlertsSummary } from '@/features/booking/api/availability-alerts.server';
import { fetchCustomerBookings } from '@/features/booking/api/customer.server';
import { fetchActiveRecurringSchedules } from '@/features/booking/api/recurring-booking-schedules.server';
import { fetchLoyaltyBalance } from '@/features/loyalty/api.server';
import { HomeDashboard } from '@/features/customer/components/my-account/HomeDashboard';

interface MyAccountHomePageProps {
  readonly params: Promise<{ readonly slug: string }>;
}

export default async function MyAccountHomePage({
  params,
}: MyAccountHomePageProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const token = await getAccessToken();
  const { userName } = decodeJwtPayload(token);

  // The two summaries are optional: each resolves to `null` on any failure, so a broken schedules
  // or alerts read hides its own tile and never redirects or blocks the rest of Início.
  const [bookings, loyaltyBalance, recurringSchedules, alertsSummary] = await Promise.all([
    withAuthRedirect(fetchCustomerBookings(token), slug),
    withAuthRedirect(fetchLoyaltyBalance(token), slug),
    fetchActiveRecurringSchedules(token),
    fetchAlertsSummary(token),
  ]);

  return (
    <HomeDashboard
      bookings={bookings.items}
      loyaltyBalance={loyaltyBalance}
      userName={userName ?? null}
      tenantSlug={slug}
      recurringSchedules={recurringSchedules}
      activeAlertCount={alertsSummary?.activeCount ?? null}
    />
  );
}
