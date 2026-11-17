import { getAccessToken } from '@/features/auth/get-access-token';
import { decodeJwtPayload } from '@/features/auth/decode-jwt';
import { withAuthRedirect } from '@/features/customer/api.server';
import { fetchAlertsSummary } from '@/features/booking/api/availability-alerts.server';
import { fetchCustomerBookings } from '@/features/booking/api/customer.server';
import { fetchActiveRecurringSchedules } from '@/features/booking/api/recurring-booking-schedules.server';
import { fetchLoyaltyBalance } from '@/features/loyalty/api.server';
import { HomeDashboard } from '@/features/customer/components/my-account/HomeDashboard';
import {
  fetchCustomerTenantOperational,
  readWhenCustomerFeatureHeld,
} from '@/shared/lib/billing/access.server';
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

  // Every surface here is optional. A read is made only for a feature the tenant holds, learned
  // from the one access answer the layout shares (never from a denied call): bookings, recurring
  // schedules and alerts belong to `BOOKING`, the points to `LOYALTY`, and a tenant without one has
  // no such tile. `nullWhenNotEntitled` stays as the backstop for a stale answer. The two summaries
  // also resolve to `null` on any failure, so a broken read hides its own tile and never blocks the
  // rest of Início, and the tenant's `operational` flag is a fail-open read (no answer shows no
  // "Empresa inativa" badge).
  const [bookings, loyaltyBalance, recurringSchedules, alertsSummary, operational] =
    await Promise.all([
      readWhenCustomerFeatureHeld(token, 'BOOKING', () =>
        withAuthRedirect(nullWhenNotEntitled(fetchCustomerBookings(token)), slug),
      ),
      readWhenCustomerFeatureHeld(token, 'LOYALTY', () =>
        withAuthRedirect(nullWhenNotEntitled(fetchLoyaltyBalance(token)), slug),
      ),
      readWhenCustomerFeatureHeld(token, 'BOOKING', () => fetchActiveRecurringSchedules(token)),
      readWhenCustomerFeatureHeld(token, 'BOOKING', () => fetchAlertsSummary(token)),
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
