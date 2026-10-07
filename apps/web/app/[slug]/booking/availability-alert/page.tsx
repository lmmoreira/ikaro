import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { fetchManifest } from '@/features/platform/api.server';
import { fetchServices } from '@/features/platform/hotsite/api/services.server';
import { AvailabilityAlertPage } from '@/features/booking/components/public/AvailabilityAlertPage';
import type { AvailabilityAlertFormService } from '@/features/booking/components/public/NewAvailabilityAlertForm';
import {
  availabilityAlertPagePath,
  isCompositeService,
  parseAvailabilityAlertParams,
} from '@/features/booking/model/availability-alert-link';
import { HotsiteAuthBar } from '@/shells/hotsite/components/HotsiteAuthBar';
import { Unavailable } from '@/shells/hotsite/components/Unavailable';
import { buildHotsiteMetadata } from '@/features/platform/hotsite/seo';
import { resolveHotsiteDisplayName } from '@/features/platform/hotsite/page-model';

export const revalidate = 300;

interface AvailabilityAlertRouteProps {
  readonly params: Promise<{ slug: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: AvailabilityAlertRouteProps): Promise<Metadata> {
  const { slug } = await params;
  const manifest = await fetchManifest(slug);
  const tBooking = await getTranslations('booking');
  const tHotsite = await getTranslations('hotsite');

  return {
    ...(await buildHotsiteMetadata({ manifest, slug, path: '/booking/availability-alert' })),
    title: manifest.isPublished
      ? tBooking('availabilityAlert.title')
      : `${tHotsite('unavailable.label')} — Ikaro`,
    robots: { index: false, follow: false },
  };
}

// M23-S31 / UC-072 — thin page: resolves the service named in the link on the server (public list,
// the same data the booking page uses) and hands the rest to the client component, which decides
// between the login card, the form and the not-eligible state.
export default async function AvailabilityAlertRoute({
  params,
  searchParams,
}: AvailabilityAlertRouteProps) {
  const { slug } = await params;
  const link = parseAvailabilityAlertParams(await searchParams);
  const manifest = await fetchManifest(slug);

  if (!manifest.isPublished) {
    return <Unavailable />;
  }

  const services = await fetchServices(slug);
  const found = services.find(
    (candidate) =>
      candidate.id === link.serviceId &&
      candidate.isActive &&
      candidate.bookingModel === 'APPOINTMENT' &&
      candidate.bookingPolicy.availabilityAlertEligible,
  );
  const service: AvailabilityAlertFormService | null = found
    ? {
        id: found.id,
        name: found.name,
        durationMinutes: found.durationMinutes,
        isComposite: isCompositeService(found),
      }
    : null;

  // Rebuilt from the parsed values, never echoed from the raw query: a guest returns from login
  // to exactly what was understood here.
  const returnTo = availabilityAlertPagePath(slug, {
    serviceId: link.serviceId ?? '',
    preferredResourceId: link.preferredResourceId,
    durationMinutes: link.durationMinutes,
  });

  return (
    <>
      <HotsiteAuthBar
        slug={slug}
        logoUrl={manifest.branding.logoUrl}
        tenantName={resolveHotsiteDisplayName(manifest)}
      />
      <AvailabilityAlertPage
        slug={slug}
        service={service}
        preferredResourceId={link.preferredResourceId}
        durationMinutes={link.durationMinutes}
        returnTo={returnTo}
      />
    </>
  );
}
