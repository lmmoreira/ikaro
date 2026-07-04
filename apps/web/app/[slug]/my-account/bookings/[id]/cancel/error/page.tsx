import { notFound, redirect } from 'next/navigation';
import { getAccessToken } from '@/features/auth/get-access-token';
import { fetchManifest } from '@/features/platform/api';
import {
  CustomerBookingDetailFetchError,
  fetchCustomerBookingDetail,
} from '@/features/customer/api.server';
import { CancelErrorPage } from '@/features/customer/components/my-account/CancelErrorPage';

interface CancelErrorRouteProps {
  readonly params: Promise<{ readonly slug: string; readonly id: string }>;
}

export default async function CancelErrorRoute({
  params,
}: CancelErrorRouteProps): Promise<React.JSX.Element> {
  const { slug, id } = await params;
  const token = await getAccessToken();

  let booking;
  try {
    booking = await fetchCustomerBookingDetail(token, id);
  } catch (err) {
    if (err instanceof CustomerBookingDetailFetchError) {
      if (err.status === 404) notFound();
      if (err.status === 401 || err.status === 403) redirect(`/${slug}/login`);
    }
    throw err;
  }

  const manifest = await fetchManifest(slug).catch(() => null);
  const whatsapp = manifest?.business.socialLinks?.whatsapp ?? null;

  return <CancelErrorPage booking={booking} tenantSlug={slug} whatsapp={whatsapp} />;
}
