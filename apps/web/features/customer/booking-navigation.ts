// Mirrors the staff dashboard's booking-navigation.ts pattern — a booking detail page can be
// reached from more than one place (the bookings list, the loyalty page's earn/redeem rows),
// so the back link needs to remember where the customer actually came from instead of always
// falling back to the bookings list.
export function resolveReturnTo(returnTo: string | undefined, tenantSlug: string): string | null {
  if (typeof returnTo !== 'string') return null;
  return returnTo.startsWith(`/${tenantSlug}/my-account/`) ? returnTo : null;
}

export function appendReturnTo(path: string, returnTo: string | null | undefined): string {
  if (!returnTo) return path;
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}returnTo=${encodeURIComponent(returnTo)}`;
}
