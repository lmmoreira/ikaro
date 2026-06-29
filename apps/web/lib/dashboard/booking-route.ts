import { notFound } from 'next/navigation';
import type { StaffBookingDetailResponse } from '@ikaro/types';
import { decodeJwtPayload } from '@/lib/auth/decode-jwt';
import { BookingDetailFetchError, fetchStaffBookingDetail } from '@/lib/api/dashboard/bookings';

export interface BookingDetailRouteMatch {
  readonly bookingId: string;
  readonly action: 'complete' | 'reschedule' | null;
}

export interface BookingDetailRouteData {
  readonly booking: StaffBookingDetailResponse;
  readonly tenantSlug: string;
}

const BOOKING_DETAIL_ROUTE = /^\/dashboard\/bookings\/([^/]+)(?:\/(complete|reschedule))?$/;

export function matchBookingDetailRoute(pathname: string): BookingDetailRouteMatch | null {
  const match = BOOKING_DETAIL_ROUTE.exec(pathname);
  if (!match) {
    return null;
  }

  return {
    bookingId: match[1],
    action: (match[2] as BookingDetailRouteMatch['action']) ?? null,
  };
}

export async function loadBookingDetailRouteData(
  token: string,
  bookingId: string,
): Promise<BookingDetailRouteData> {
  const payload = decodeJwtPayload(token);
  const tenantSlug = payload.tenantSlug ?? '';

  try {
    const booking = await fetchStaffBookingDetail(token, bookingId);
    return { booking, tenantSlug };
  } catch (err) {
    if (err instanceof BookingDetailFetchError && err.status === 404) {
      notFound();
    }
    throw err;
  }
}
