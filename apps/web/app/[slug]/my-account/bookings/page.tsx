import { redirect } from 'next/navigation';
import { getAccessToken } from '@/features/auth/get-access-token';
import { withAuthRedirect } from '@/features/customer/api.server';
import { fetchAlertsSummary } from '@/features/booking/api/availability-alerts.server';
import { fetchCustomerBookings } from '@/features/booking/api/customer.server';
import { fetchRecurringSummary } from '@/features/booking/api/recurring-booking-schedules.server';
import { BookingsList } from '@/features/customer/components/my-account/BookingsList';
import { nullWhenNotEntitled } from '@/shared/lib/api/errors';
import { redirectCustomerWithoutFeature } from '@/shared/lib/billing/access.server';

interface MyAccountBookingsPageProps {
  readonly params: Promise<{ readonly slug: string }>;
}

export default async function MyAccountBookingsPage({
  params,
}: MyAccountBookingsPageProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const token = await getAccessToken();
  await redirectCustomerWithoutFeature(token, slug, 'BOOKING');

  // The recurring and alerts summaries only feed optional entry rows and resolve to null on any
  // failure, so they can never block the tab; the bookings read handles an expired session. What a
  // suspended tenant changes comes from the capabilities the account shell provides.
  const [bookings, recurringSummary, alertsSummary] = await Promise.all([
    withAuthRedirect(nullWhenNotEntitled(fetchCustomerBookings(token)), slug),
    fetchRecurringSummary(token),
    fetchAlertsSummary(token),
  ]);

  // Backstop for the one case the feature list could not answer (a failed read): the typed denial.
  if (bookings === null) redirect(`/${slug}/my-account`);

  return (
    <BookingsList
      bookings={bookings.items}
      recurringSummary={recurringSummary}
      alertsSummary={alertsSummary}
      tenantSlug={slug}
    />
  );
}
