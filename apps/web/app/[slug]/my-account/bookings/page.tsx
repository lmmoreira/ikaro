import { getAccessToken } from '@/features/auth/get-access-token';
import { withAuthRedirect } from '@/features/customer/api.server';
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

  // The recurring summary only feeds an optional entry row and resolves to null on any failure, so
  // it can never block the tab; the bookings read handles an expired session.
  const [bookings, recurringSummary] = await Promise.all([
    withAuthRedirect(fetchCustomerBookings(token), slug),
    fetchRecurringSummary(token),
  ]);

  return (
    <BookingsList bookings={bookings.items} recurringSummary={recurringSummary} tenantSlug={slug} />
  );
}
