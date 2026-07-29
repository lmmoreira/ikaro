import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { fetchManifest } from '@/features/platform/api.server';
import { fetchServices } from '@/features/platform/hotsite/api/services.server';
import { BookingForm } from '@/features/booking/components/public/BookingForm';
import { HotsiteAuthBar } from '@/shells/hotsite/components/HotsiteAuthBar';
import { Unavailable } from '@/shells/hotsite/components/Unavailable';
import { buildHotsiteMetadata } from '@/features/platform/hotsite/seo';
import { BookingCtaModuleDataSchema } from '@/features/platform/hotsite/module-schemas';
import { resolveHotsiteDisplayName } from '@/features/platform/hotsite/page-model';

export const revalidate = 300;

interface BookingPageProps {
  readonly params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: BookingPageProps): Promise<Metadata> {
  const { slug } = await params;
  const manifest = await fetchManifest(slug);
  const tBooking = await getTranslations('booking');
  const tHotsite = await getTranslations('hotsite');

  return {
    ...(await buildHotsiteMetadata({ manifest, slug, path: '/booking' })),
    title: manifest.isPublished ? tBooking('title') : `${tHotsite('unavailable.label')} — Ikaro`,
    robots: { index: false, follow: false },
  };
}

export default async function BookingPage({ params }: BookingPageProps) {
  const { slug } = await params;
  const manifest = await fetchManifest(slug);

  if (!manifest.isPublished) {
    return <Unavailable />;
  }

  const services = await fetchServices(slug);

  const bookingCtaModule = manifest.layout.find((m) => m.type === 'BOOKING_CTA');
  const parsed = BookingCtaModuleDataSchema.safeParse(bookingCtaModule?.data);
  const carouselDays = parsed.success ? (parsed.data.carouselDays ?? 14) : 14;
  const datePickerType = parsed.success ? (parsed.data.datePickerType ?? 'carousel') : 'carousel';

  const displayName = resolveHotsiteDisplayName(manifest);

  return (
    <>
      <HotsiteAuthBar slug={slug} logoUrl={manifest.branding.logoUrl} tenantName={displayName} />
      <BookingForm
        slug={slug}
        services={services}
        carouselDays={carouselDays}
        datePickerType={datePickerType}
        // manifest.booking is optional (see @ikaro/types) — falls back to the documented tenant
        // settings default (docs/21-TENANTS_SETTINGS_SCHEMA.md) rather than dereferencing unconditionally.
        maxBookingAdvanceDays={manifest.booking?.maxBookingAdvanceDays ?? 90}
        phonePrefix={manifest.localization.phonePrefix}
        addressSpec={manifest.localization.address}
      />
    </>
  );
}
