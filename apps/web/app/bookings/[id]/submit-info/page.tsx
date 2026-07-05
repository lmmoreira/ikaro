import type React from 'react';
import { SubmitInfoForm } from '@/features/booking/components/public/SubmitInfoForm';
import { InvalidLinkView } from '@/features/booking/components/public/InvalidLinkView';
import { verifyGuestToken } from '@/features/booking/model/guest-token';
import { fetchGuestBookingSummary, GuestBookingReadError } from '@/features/booking/api/public';
import { fetchManifest } from '@/features/platform/api';
import { applyBranding } from '@/features/platform/hotsite/apply-branding';
import { resolveSupportedLocale } from '@/shared/lib/i18n/get-messages';
import { isValidTimezone } from '@/shared/lib/formatting/locale-validators';
import type { GuestBookingReadResponse } from '@ikaro/types';

// This page lives at apps/web/app/bookings/[id]/submit-info/page.tsx.
// Next.js static segment 'bookings/' takes priority over the top-level '[slug]/' dynamic
// segment — no route conflict. No auth required: page is fully public, the guest token
// in the URL is the only access control, independently re-verified by the BFF on submit.

interface SubmitInfoPageProps {
  readonly params: Promise<{ readonly id: string }>;
  readonly searchParams: Promise<{ readonly token?: string }>;
}

export default async function SubmitInfoPage({
  params,
  searchParams,
}: SubmitInfoPageProps): Promise<React.JSX.Element> {
  const { id } = await params;
  const { token } = await searchParams;

  if (!token) {
    return <InvalidLinkView reason="invalid" />;
  }
  const payload = verifyGuestToken(token);
  if (!payload || payload.bookingId !== id) {
    return <InvalidLinkView reason="invalid" />;
  }

  // Tenant branding: degrades to tokens.css defaults (brandingStyle undefined) when the
  // manifest fetch fails or the token predates M13-S38's tenantSlug payload addition.
  const manifest = payload.tenantSlug
    ? await fetchManifest(payload.tenantSlug).catch(() => null)
    : null;
  const brandingStyle = manifest ? applyBranding(manifest.branding) : undefined;
  const brandName = manifest?.branding.brandName ?? manifest?.tenant.name;
  const locale = resolveSupportedLocale(manifest?.localization.language ?? 'pt-BR');
  const timezone =
    manifest && isValidTimezone(manifest.localization.timezone)
      ? manifest.localization.timezone
      : 'America/Sao_Paulo';
  const timeFormat = manifest?.localization.timeFormat ?? '24h';

  // Optional: booking summary (M13-S39). A 409 means the booking is no longer
  // INFO_REQUESTED — block submission with the "processed" invalid-link variant. Any other
  // failure (network error, or the endpoint not existing because M13-S39 wasn't deployed)
  // degrades to rendering the form without a summary card.
  let summary: GuestBookingReadResponse | null = null;
  try {
    summary = await fetchGuestBookingSummary(id, token);
  } catch (err) {
    if (err instanceof GuestBookingReadError && err.status === 409) {
      return (
        <InvalidLinkView
          reason="processed"
          tenantName={brandName}
          tenantSlug={payload.tenantSlug}
          brandingStyle={brandingStyle}
        />
      );
    }
    summary = null;
  }

  return (
    <SubmitInfoForm
      bookingId={id}
      token={token}
      summary={summary}
      brandName={brandName}
      brandingStyle={brandingStyle}
      locale={locale}
      timezone={timezone}
      timeFormat={timeFormat}
    />
  );
}
