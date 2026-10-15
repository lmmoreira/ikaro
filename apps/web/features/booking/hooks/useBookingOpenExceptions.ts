import { useQuery } from '@tanstack/react-query';
import { listOpenSchedulingExceptionsForBooking } from '@/features/booking/api/scheduling-exceptions';
import { useTenant } from '@/providers/tenant-provider';

// M23-S46 — the open "Reservas a resolver" entries of ONE booking (with their alternatives), for
// the booking detail's decision panel. MANAGER only: the route is manager-only on the BFF, so a
// STAFF user never fires the request. The key sits under ['scheduling-exceptions', tenantId], so
// every resolve, deactivation and reactivation that refreshes the worklist refreshes this too.
export function useBookingOpenExceptions(bookingId: string) {
  const { tenantId, role } = useTenant();
  return useQuery({
    queryKey: ['scheduling-exceptions', tenantId, 'booking', bookingId],
    queryFn: () => listOpenSchedulingExceptionsForBooking(bookingId),
    enabled: role === 'MANAGER',
  });
}
