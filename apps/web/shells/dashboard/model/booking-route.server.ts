import { notFound } from 'next/navigation';
import type { StaffBookingDetailResponse } from '@ikaro/types';
import { decodeJwtPayload } from '@/features/auth/decode-jwt';
import { BookingDetailFetchError, fetchStaffBookingDetail } from '@/features/booking/api/staff';

export interface BookingDetailRouteData {
  readonly booking: StaffBookingDetailResponse;
  readonly tenantSlug: string;
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
