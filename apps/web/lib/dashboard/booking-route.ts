export interface BookingDetailRouteMatch {
  readonly bookingId: string;
  readonly action: 'complete' | 'reschedule' | null;
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
