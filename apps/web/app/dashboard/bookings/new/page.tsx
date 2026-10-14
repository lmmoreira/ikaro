import { getAccessToken } from '@/features/auth/get-access-token';
import { decodeJwtPayload } from '@/features/auth/decode-jwt';
import { NewBookingChooserPage } from '@/features/booking/components/dashboard/bookings/NewBookingChooserPage';
import { fetchManifest } from '@/features/platform/api.server';

// UC-108: who is the booking for? The first step of everything staff create on a customer's behalf.
export default async function NewBookingRoute(): Promise<React.JSX.Element> {
  const token = await getAccessToken();
  const { tenantSlug } = decodeJwtPayload(token);
  const manifest = await fetchManifest(tenantSlug ?? '');

  return <NewBookingChooserPage phonePrefix={manifest.localization.phonePrefix} />;
}
