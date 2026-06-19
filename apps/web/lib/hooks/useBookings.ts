import { useQuery } from '@tanstack/react-query';
import { getBooking, listBookings, type BookingListFilters } from '@/lib/api/dashboard/bookings';
import { getTenantId } from '@/lib/api/bff-client';

export function useBookings(filters?: BookingListFilters) {
  const tenantId = getTenantId();
  return useQuery({
    queryKey: ['bookings', tenantId, filters],
    queryFn: () => listBookings(filters),
  });
}

export function useBooking(id: string) {
  const tenantId = getTenantId();
  return useQuery({
    queryKey: ['bookings', tenantId, id],
    queryFn: () => getBooking(id),
    enabled: Boolean(id),
  });
}
