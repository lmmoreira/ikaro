import 'server-only';
import type { GuestBookingReadResponse } from '@ikaro/types';
import { bffPublicFetch } from '@/shared/lib/api/bff-server';
import { assertOk, FetchError } from '@/shared/lib/api/errors';

export class GuestBookingReadError extends FetchError {
  constructor(status: number, code?: string, field?: string, detail?: string) {
    super(`Failed to fetch guest booking summary (${status})`, status, code, field, detail);
    this.name = 'GuestBookingReadError';
  }
}

// Throws GuestBookingReadError on any non-2xx response — callers distinguish a 409 (booking no
// longer INFO_REQUESTED, must block the form) from every other failure (network error, or the
// endpoint not existing because M13-S39 wasn't deployed — both degrade to "no summary card").
export async function fetchGuestBookingSummary(
  bookingId: string,
  token: string,
): Promise<GuestBookingReadResponse> {
  const res = await bffPublicFetch(
    `/bookings/${encodeURIComponent(bookingId)}/guest?token=${encodeURIComponent(token)}`,
  );
  await assertOk(res, GuestBookingReadError);
  return res.json() as Promise<GuestBookingReadResponse>;
}
