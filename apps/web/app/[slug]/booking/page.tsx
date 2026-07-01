import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { fetchManifest } from '@/lib/api/platform';
import { fetchServices } from '@/lib/api/hotsite/services';
import { BookingForm } from '@/components/booking/BookingForm';
import { HotsiteAuthBar } from '@/components/hotsite/HotsiteAuthBar';
import { Unavailable } from '@/components/hotsite/Unavailable';
import { buildHotsiteMetadata } from '@/lib/hotsite/seo';
import { BookingCtaModuleDataSchema } from '@/lib/hotsite/module-schemas';

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

  return (
    <>
      <HotsiteAuthBar slug={slug} />
      <BookingForm
        slug={slug}
        services={services}
        carouselDays={carouselDays}
        phonePrefix={manifest.localization.phonePrefix}
        addressSpec={manifest.localization.address}
      />
    </>
  );
}
