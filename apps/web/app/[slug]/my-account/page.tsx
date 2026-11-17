import { getAccessToken } from '@/features/auth/get-access-token';
import { decodeJwtPayload } from '@/features/auth/decode-jwt';
import { withAuthRedirect } from '@/features/customer/api.server';
import { fetchAlertsSummary } from '@/features/booking/api/availability-alerts.server';
import { fetchCustomerBookings } from '@/features/booking/api/customer.server';
import { fetchActiveRecurringSchedules } from '@/features/booking/api/recurring-booking-schedules.server';
import { fetchLoyaltyBalance } from '@/features/loyalty/api.server';
import { HomeDashboard } from '@/features/customer/components/my-account/HomeDashboard';
import { fetchCustomerTenantOperational } from '@/shared/lib/billing/access.server';
import { nullWhenNotEntitled } from '@/shared/lib/api/errors';

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
  // or alerts read hides its own tile and never redirects or blocks the rest of Início. The loyalty
  // balance is optional too, and so are the bookings (a tenant without `BOOKING` shows no bookings surface): a tenant without the `LOYALTY` feature has no points tile, and the
  // tenant's `operational` flag is a fail-open read (no answer shows no "Empresa inativa" badge).
  const [bookings, loyaltyBalance, recurringSchedules, alertsSummary, operational] =
    await Promise.all([
      withAuthRedirect(nullWhenNotEntitled(fetchCustomerBookings(token)), slug),
      withAuthRedirect(nullWhenNotEntitled(fetchLoyaltyBalance(token)), slug),
      fetchActiveRecurringSchedules(token),
      fetchAlertsSummary(token),
      fetchCustomerTenantOperational(token),
    ]);

  return (
    <HomeDashboard
      bookings={bookings?.items ?? null}
      loyaltyBalance={loyaltyBalance}
      userName={userName ?? null}
      tenantSlug={slug}
      recurringSchedules={recurringSchedules}
      activeAlertCount={alertsSummary?.activeCount ?? null}
      tenantOperational={operational !== false}
    />
  );
}
