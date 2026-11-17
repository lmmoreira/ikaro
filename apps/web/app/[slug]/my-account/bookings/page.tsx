import { redirect } from 'next/navigation';
import { getAccessToken } from '@/features/auth/get-access-token';
import { withAuthRedirect } from '@/features/customer/api.server';
import { fetchAlertsSummary } from '@/features/booking/api/availability-alerts.server';
import { fetchCustomerBookings } from '@/features/booking/api/customer.server';
import { fetchRecurringSummary } from '@/features/booking/api/recurring-booking-schedules.server';
import { BookingsList } from '@/features/customer/components/my-account/BookingsList';
import { nullWhenNotEntitled } from '@/shared/lib/api/errors';
import { fetchCustomerTenantOperational } from '@/shared/lib/billing/access.server';

interface MyAccountBookingsPageProps {
  readonly params: Promise<{ readonly slug: string }>;
}

export default async function MyAccountBookingsPage({
  params,
}: MyAccountBookingsPageProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const token = await getAccessToken();

  // The recurring and alerts summaries only feed optional entry rows and resolve to null on any
  // failure, so they can never block the tab; the bookings read handles an expired session. The
  // tenant's `operational` flag is a fail-open read: no answer is never read as a suspension.
  const [bookings, recurringSummary, alertsSummary, operational] = await Promise.all([
    withAuthRedirect(nullWhenNotEntitled(fetchCustomerBookings(token)), slug),
    fetchRecurringSummary(token),
    fetchAlertsSummary(token),
    fetchCustomerTenantOperational(token),
  ]);

  // A tenant without the `BOOKING` feature has no bookings list: its customers land on Início.
  if (bookings === null) redirect(`/${slug}/my-account`);

  return (
    <BookingsList
      bookings={bookings.items}
      recurringSummary={recurringSummary}
      alertsSummary={alertsSummary}
      tenantSlug={slug}
      tenantOperational={operational !== false}
    />
  );
}
