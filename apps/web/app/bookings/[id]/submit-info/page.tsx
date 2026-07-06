import type React from 'react';
import type { HotsiteManifestResponse, GuestBookingReadResponse } from '@ikaro/types';
import { SubmitInfoForm } from '@/features/booking/components/public/SubmitInfoForm';
import { InvalidLinkView } from '@/features/booking/components/public/InvalidLinkView';
import { verifyGuestToken, decodeUnverifiedTenantSlug } from '@/features/booking/model/guest-token';
import { fetchGuestBookingSummary, GuestBookingReadError } from '@/features/booking/api/public';
import { fetchManifestResponse } from '@/features/platform/api';
import { applyBranding } from '@/features/platform/hotsite/apply-branding';
import { DEFAULT_HOTSITE_BRANDING } from '@/features/platform/hotsite/default-branding';
import { resolveSupportedLocale } from '@/shared/lib/i18n/get-messages';
import { isValidTimezone } from '@/shared/lib/formatting/locale-validators';

// This page lives at apps/web/app/bookings/[id]/submit-info/page.tsx.
// Next.js static segment 'bookings/' takes priority over the top-level '[slug]/' dynamic
// segment — no route conflict. No auth required: page is fully public, the guest token
// in the URL is the only access control, independently re-verified by the BFF on submit.

interface SubmitInfoPageProps {
  readonly params: Promise<{ readonly id: string }>;
  readonly searchParams: Promise<{ readonly token?: string }>;
}

// fetchManifest() (features/platform/api.ts) calls Next.js's notFound() on a 404 — a
// framework-level signal that renders the global not-found page even when the call is
// wrapped in try/catch or .catch(). This page wants graceful degradation instead (fall back
// to default branding), so it fetches the raw Response itself and never triggers notFound().
async function fetchManifestSafely(slug: string): Promise<HotsiteManifestResponse | null> {
  try {
    const res = await fetchManifestResponse(slug);
    if (!res.ok) return null;
    return (await res.json()) as HotsiteManifestResponse;
  } catch {
    return null;
  }
}

export default async function SubmitInfoPage({
  params,
  searchParams,
}: SubmitInfoPageProps): Promise<React.JSX.Element> {
  const { id } = await params;
  const { token } = await searchParams;

  const payload = token ? verifyGuestToken(token) : null;

  // Tenant branding: prefer the verified payload's tenantSlug; fall back to an unverified
  // decode when verification failed (expired/tampered/pre-M13-S38 token). Safe — hotsite
  // branding is public data (GET /platform/manifest/:slug needs no auth), so an unverified
  // claim here can only pick a harmless public color scheme, never grant booking access.
  const brandingSlug = payload?.tenantSlug ?? (token ? decodeUnverifiedTenantSlug(token) : null);
  const manifest = brandingSlug ? await fetchManifestSafely(brandingSlug) : null;
  const brandingStyle = applyBranding(manifest?.branding ?? DEFAULT_HOTSITE_BRANDING);
  const brandName = manifest?.branding.brandName ?? manifest?.tenant.name;
  const locale = resolveSupportedLocale(manifest?.localization.language ?? 'pt-BR');
  const timezone =
    manifest && isValidTimezone(manifest.localization.timezone)
      ? manifest.localization.timezone
      : 'America/Sao_Paulo';
  const timeFormat = manifest?.localization.timeFormat ?? '24h';

  if (!token || payload?.bookingId !== id) {
    return (
      <InvalidLinkView
        reason="invalid"
        tenantName={brandName}
        tenantSlug={brandingSlug ?? undefined}
        brandingStyle={brandingStyle}
      />
    );
  }

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
      tenantSlug={payload.tenantSlug}
    />
  );
}
