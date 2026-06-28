import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { BookingDetailFetchError, fetchStaffBookingDetail } from '@/lib/api/dashboard/bookings';
import { MarkCompleteBookingPage } from '@/components/dashboard/bookings/MarkCompleteBookingPage';

interface BookingCompleteRouteProps {
  readonly params: Promise<{ id: string }>;
}

export default async function BookingCompleteRoute({
  params,
}: BookingCompleteRouteProps): Promise<React.JSX.Element> {
  const { id } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get('access_token')?.value ?? '';

  let booking!: Awaited<ReturnType<typeof fetchStaffBookingDetail>>;
  try {
    booking = await fetchStaffBookingDetail(token, id);
  } catch (err) {
    if (err instanceof BookingDetailFetchError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  return <MarkCompleteBookingPage booking={booking} backHref={`/dashboard/bookings/${id}`} />;
}
