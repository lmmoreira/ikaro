import type { BookingResponse, CreateBookingByStaffRequest } from '@ikaro/types';
import { bffClient } from '@/shared/lib/api/bff-client';

// UC-108 — a staff member books on a customer's behalf. The booking is created `APPROVED`; the
// acting staff id comes from the session on the BFF, never from this body.
export async function createBookingByStaff(
  payload: CreateBookingByStaffRequest,
): Promise<BookingResponse> {
  const res = await bffClient.post<BookingResponse>('/bookings/staff', payload);
  return res.data;
}
