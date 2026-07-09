import 'server-only';
import type { GuestBookingReadResponse } from '@ikaro/types';
import { bffPublicFetch } from '@/shared/lib/api/bff-server';

export class GuestBookingReadError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'GuestBookingReadError';
    Object.setPrototypeOf(this, new.target.prototype);
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

  if (!res.ok) {
    throw new GuestBookingReadError(
      res.status,
      `Failed to fetch guest booking summary for booking "${bookingId}"`,
    );
  }

  return res.json() as Promise<GuestBookingReadResponse>;
}
