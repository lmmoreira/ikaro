export interface RecurringScheduleRouteMatch {
  readonly scheduleId: string;
}

// The staff approval screen of one recurring-schedule request (M23-S13). It sits two segments below
// /dashboard/bookings, so matchBookingDetailRoute() (one segment = a booking id, plus the optional
// complete/reschedule sheets) never reads it as a booking; this matcher is what gives the screen its
// own topbar title and back link and hides the bottom navigation, like every other drill-down.
const RECURRING_SCHEDULE_ROUTE = /^\/dashboard\/bookings\/recurring\/([^/]+)$/;

export function matchRecurringScheduleRoute(pathname: string): RecurringScheduleRouteMatch | null {
  const match = RECURRING_SCHEDULE_ROUTE.exec(pathname);
  return match ? { scheduleId: match[1] } : null;
}
