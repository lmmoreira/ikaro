import { getAccessToken } from '@/features/auth/get-access-token';
import { fetchManifest } from '@/features/platform/api';
import { fetchCustomerBookingDetailOrRedirect } from '@/features/customer/api.server';
import { CancelErrorPage } from '@/features/customer/components/my-account/CancelErrorPage';

interface CancelErrorRouteProps {
  readonly params: Promise<{ readonly slug: string; readonly id: string }>;
}

export default async function CancelErrorRoute({
  params,
}: CancelErrorRouteProps): Promise<React.JSX.Element> {
  const { slug, id } = await params;
  const token = await getAccessToken();
  const booking = await fetchCustomerBookingDetailOrRedirect(token, id, slug);

  const manifest = await fetchManifest(slug).catch(() => null);
  const whatsapp = manifest?.business.socialLinks?.whatsapp ?? null;

  return <CancelErrorPage booking={booking} tenantSlug={slug} whatsapp={whatsapp} />;
}
