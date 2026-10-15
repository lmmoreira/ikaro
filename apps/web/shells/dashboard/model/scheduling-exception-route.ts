export interface SchedulingExceptionRouteMatch {
  readonly exceptionId: string;
}

// The only drill-down under /dashboard/scheduling-exceptions: the reschedule of one entry's
// booking, which reuses the staff reschedule page. The list itself (the bare section route) is a
// top-level page with no back link, so it is deliberately not matched here.
const RESCHEDULE_ROUTE = /^\/dashboard\/scheduling-exceptions\/([^/]+)\/reschedule$/;

export function matchSchedulingExceptionRescheduleRoute(
  pathname: string,
): SchedulingExceptionRouteMatch | null {
  const match = RESCHEDULE_ROUTE.exec(pathname);
  return match ? { exceptionId: match[1] } : null;
}
