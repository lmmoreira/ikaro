import { getAccessToken } from '@/features/auth/get-access-token';
import { fetchManifest } from '@/features/platform/api.server';
import { fetchCustomerBookingDetailOrRedirect } from '@/features/booking/api/customer.server';
import { resolveReturnTo } from '@/features/customer/booking-navigation';
import { CancelErrorPage } from '@/features/customer/components/my-account/CancelErrorPage';
import { redirectCustomerWithoutFeature } from '@/shared/lib/billing/access.server';

interface CancelErrorRouteProps {
  readonly params: Promise<{ readonly slug: string; readonly id: string }>;
  readonly searchParams: Promise<{ readonly returnTo?: string }>;
}

export default async function CancelErrorRoute({
  params,
  searchParams,
}: CancelErrorRouteProps): Promise<React.JSX.Element> {
  const { slug, id } = await params;
  const { returnTo } = await searchParams;
  const token = await getAccessToken();
  await redirectCustomerWithoutFeature(token, slug, 'BOOKING');
  const booking = await fetchCustomerBookingDetailOrRedirect(token, id, slug);

  const manifest = await fetchManifest(slug).catch(() => null);
  const whatsapp = manifest?.business.socialLinks?.whatsapp ?? null;

  return (
    <CancelErrorPage
      booking={booking}
      tenantSlug={slug}
      whatsapp={whatsapp}
      returnTo={resolveReturnTo(returnTo, slug)}
    />
  );
}
