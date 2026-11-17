import { redirect } from 'next/navigation';
import { getAccessToken } from '@/features/auth/get-access-token';
import { withAuthRedirect } from '@/features/customer/api.server';
import {
  fetchLoyaltyBalance,
  fetchLoyaltyEntries,
  fetchLoyaltyRedemptions,
} from '@/features/loyalty/api.server';
import { LoyaltyPage } from '@/features/customer/components/my-account/LoyaltyPage';
import { nullWhenNotEntitled } from '@/shared/lib/api/errors';
import {
  fetchCustomerTenantOperational,
  redirectCustomerWithoutFeature,
} from '@/shared/lib/billing/access.server';

interface MyAccountLoyaltyPageProps {
  readonly params: Promise<{ readonly slug: string }>;
}

export default async function MyAccountLoyaltyPage({
  params,
}: MyAccountLoyaltyPageProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const token = await getAccessToken();
  await redirectCustomerWithoutFeature(token, slug, 'LOYALTY');

  const [balance, entries, redemptions, operational] = await Promise.all([
    withAuthRedirect(nullWhenNotEntitled(fetchLoyaltyBalance(token)), slug),
    withAuthRedirect(nullWhenNotEntitled(fetchLoyaltyEntries(token)), slug),
    withAuthRedirect(nullWhenNotEntitled(fetchLoyaltyRedemptions(token)), slug),
    fetchCustomerTenantOperational(token),
  ]);

  // A tenant without the `LOYALTY` feature has no points program: its customers land back on
  // Início, which shows no points tile, instead of an error or a login loop.
  if (balance === null || entries === null || redemptions === null) {
    redirect(`/${slug}/my-account`);
  }

  return (
    <LoyaltyPage
      balance={balance}
      entries={entries}
      redemptions={redemptions}
      tenantSlug={slug}
      tenantOperational={operational !== false}
    />
  );
}
