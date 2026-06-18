import type { Metadata } from 'next';
import { fetchManifest } from '@/lib/api/platform';
import { fetchServices } from '@/lib/api/services';
import { BookingForm } from '@/components/booking/BookingForm';
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

  return {
    ...buildHotsiteMetadata({ manifest, slug, path: '/booking' }),
    title: manifest.isPublished ? 'Agendar serviço' : 'Em breve — Ikaro',
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

  return <BookingForm slug={slug} services={services} carouselDays={carouselDays} />;
}
