import { getAccessToken } from '@/features/auth/get-access-token';
import { fetchCustomerBookings, fetchLoyaltyBalance } from '@/features/customer/api.server';
import { BookingsList } from '@/features/customer/components/my-account/BookingsList';

interface MyAccountBookingsPageProps {
  readonly params: Promise<{ readonly slug: string }>;
}

export default async function MyAccountBookingsPage({
  params,
}: MyAccountBookingsPageProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const token = await getAccessToken();

  const [bookings, loyaltyBalance] = await Promise.all([
    fetchCustomerBookings(token),
    fetchLoyaltyBalance(token),
  ]);

  return (
    <BookingsList bookings={bookings.items} loyaltyBalance={loyaltyBalance} tenantSlug={slug} />
  );
}
