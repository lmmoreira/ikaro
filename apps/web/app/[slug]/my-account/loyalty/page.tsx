import { getAccessToken } from '@/features/auth/get-access-token';
import {
  fetchLoyaltyBalance,
  fetchLoyaltyEntries,
  fetchLoyaltyRedemptions,
  withAuthRedirect,
} from '@/features/customer/api.server';
import { LoyaltyPage } from '@/features/customer/components/my-account/LoyaltyPage';

interface MyAccountLoyaltyPageProps {
  readonly params: Promise<{ readonly slug: string }>;
}

export default async function MyAccountLoyaltyPage({
  params,
}: MyAccountLoyaltyPageProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const token = await getAccessToken();

  const [balance, entries, redemptions] = await Promise.all([
    withAuthRedirect(fetchLoyaltyBalance(token), slug),
    withAuthRedirect(fetchLoyaltyEntries(token), slug),
    withAuthRedirect(fetchLoyaltyRedemptions(token), slug),
  ]);

  return (
    <LoyaltyPage balance={balance} entries={entries} redemptions={redemptions} tenantSlug={slug} />
  );
}
