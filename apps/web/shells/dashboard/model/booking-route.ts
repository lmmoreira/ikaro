export interface BookingDetailRouteMatch {
  readonly bookingId: string;
  readonly action: 'complete' | 'reschedule' | null;
}

const BOOKING_DETAIL_ROUTE = /^\/dashboard\/bookings\/([^/]+)(?:\/(complete|reschedule))?$/;

// The staff "Novo agendamento" flow (UC-108): the customer chooser, then the booking steps. A
// static segment next to `[id]`, so the detail pattern above would otherwise read "new" as a
// booking id — matchBookingDetailRoute() returns null for it, like matchResourceRoute() does
// for resources' own "new".
const BOOKING_CREATE_ROUTE = /^\/dashboard\/bookings\/new(?:\/booking)?$/;

export function isBookingCreateRoute(pathname: string): boolean {
  return BOOKING_CREATE_ROUTE.test(pathname);
}

export function matchBookingDetailRoute(pathname: string): BookingDetailRouteMatch | null {
  if (isBookingCreateRoute(pathname)) {
    return null;
  }
  const match = BOOKING_DETAIL_ROUTE.exec(pathname);
  if (!match) {
    return null;
  }

  return {
    bookingId: match[1],
    action: (match[2] as BookingDetailRouteMatch['action']) ?? null,
  };
}
