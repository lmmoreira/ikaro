// Mirrors the staff dashboard's booking-navigation.ts pattern — a booking detail page can be
// reached from more than one place (the bookings list, the loyalty page's earn/redeem rows),
// so the back link needs to remember where the customer actually came from instead of always
// falling back to the bookings list.
export function resolveReturnTo(returnTo: string | undefined, tenantSlug: string): string | null {
  if (typeof returnTo !== 'string') return null;
  return returnTo.startsWith(`/${tenantSlug}/my-account/`) ? returnTo : null;
}

/** Which back label a booking page shows for the place the customer came from. */
export type ReturnBackLabelKey = 'backToLoyalty' | 'backToSchedule' | 'backToBookings';

export function returnBackLabelKey(returnTo: string | null | undefined): ReturnBackLabelKey {
  if (!returnTo) return 'backToBookings';
  const path = returnTo.split('?')[0] ?? returnTo;
  if (path.endsWith('/loyalty')) return 'backToLoyalty';
  if (path.includes('/my-account/recurring-schedules/')) return 'backToSchedule';
  return 'backToBookings';
}

export function appendReturnTo(path: string, returnTo: string | null | undefined): string {
  if (!returnTo) return path;
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}returnTo=${encodeURIComponent(returnTo)}`;
}
