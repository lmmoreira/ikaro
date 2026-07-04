import { getAccessToken } from '@/features/auth/get-access-token';
import { decodeJwtPayload } from '@/features/auth/decode-jwt';
import {
  fetchCustomerBookings,
  fetchLoyaltyBalance,
  withAuthRedirect,
} from '@/features/customer/api.server';
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

  const [bookings, loyaltyBalance] = await Promise.all([
    withAuthRedirect(fetchCustomerBookings(token), slug),
    withAuthRedirect(fetchLoyaltyBalance(token), slug),
  ]);

  return (
    <HomeDashboard
      bookings={bookings.items}
      loyaltyBalance={loyaltyBalance}
      userName={userName ?? null}
      tenantSlug={slug}
    />
  );
}
