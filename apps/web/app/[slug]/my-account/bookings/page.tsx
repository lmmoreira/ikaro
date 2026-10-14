import { getAccessToken } from '@/features/auth/get-access-token';
import { withAuthRedirect } from '@/features/customer/api.server';
import { fetchAlertsSummary } from '@/features/booking/api/availability-alerts.server';
import { fetchCustomerBookings } from '@/features/booking/api/customer.server';
import { fetchRecurringSummary } from '@/features/booking/api/recurring-booking-schedules.server';
import { BookingsList } from '@/features/customer/components/my-account/BookingsList';

interface MyAccountBookingsPageProps {
  readonly params: Promise<{ readonly slug: string }>;
}

export default async function MyAccountBookingsPage({
  params,
}: MyAccountBookingsPageProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const token = await getAccessToken();

  // The recurring and alerts summaries only feed optional entry rows and resolve to null on any
  // failure, so they can never block the tab; the bookings read handles an expired session.
  const [bookings, recurringSummary, alertsSummary] = await Promise.all([
    withAuthRedirect(fetchCustomerBookings(token), slug),
    fetchRecurringSummary(token),
    fetchAlertsSummary(token),
  ]);

  return (
    <BookingsList
      bookings={bookings.items}
      recurringSummary={recurringSummary}
      alertsSummary={alertsSummary}
      tenantSlug={slug}
    />
  );
}
