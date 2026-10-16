import { getAccessToken } from '@/features/auth/get-access-token';
import { decodeJwtPayload } from '@/features/auth/decode-jwt';
import { NewBookingChooserPage } from '@/features/booking/components/dashboard/bookings/NewBookingChooserPage';
import { fetchManifest } from '@/features/platform/api.server';

// UC-108: who is the booking for? The first step of everything staff create on a customer's behalf.
export default async function NewBookingRoute({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly tipo?: string }>;
}): Promise<React.JSX.Element> {
  const { tipo } = await searchParams;
  const token = await getAccessToken();
  const { tenantSlug } = decodeJwtPayload(token);
  const manifest = await fetchManifest(tenantSlug ?? '');

  // `?tipo=recorrencia` (the "+ Novo" menu's second item); anything else is a one-off booking.
  return (
    <NewBookingChooserPage
      phonePrefix={manifest.localization.phonePrefix}
      kind={tipo === 'recorrencia' ? 'recorrencia' : 'agendamento'}
    />
  );
}
