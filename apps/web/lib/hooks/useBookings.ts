import { useQuery } from '@tanstack/react-query';
import type { StaffBookingListResponse } from '@ikaro/types';
import { getBooking, listBookings, type BookingListFilters } from '@/lib/api/dashboard/bookings';
import { useTenant } from '@/providers/tenant-provider';

export function useBookings(filters?: BookingListFilters) {
  const { tenantId } = useTenant();
  return useQuery({
    queryKey: ['bookings', tenantId, filters],
    queryFn: () => listBookings(filters),
  });
}

export function useBooking(id: string) {
  const { tenantId } = useTenant();
  return useQuery({
    queryKey: ['bookings', tenantId, id],
    queryFn: () => getBooking(id),
    enabled: Boolean(id),
  });
}

async function fetchBookingsViaProxy(
  params: Record<string, string>,
): Promise<StaffBookingListResponse> {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`/api/bookings?${query}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch bookings (${res.status})`);
  return res.json() as Promise<StaffBookingListResponse>;
}

export function useActionNeededBookings(
  from: string,
  to: string,
  initialData?: StaffBookingListResponse,
) {
  const { tenantId } = useTenant();
  return useQuery({
    queryKey: ['bookings', 'action-needed', tenantId, from, to],
    queryFn: () => fetchBookingsViaProxy({ status: 'PENDING,INFO_REQUESTED', from, to }),
    initialData,
  });
}

export function useTodayBookings(date: string, initialData?: StaffBookingListResponse) {
  const { tenantId } = useTenant();
  return useQuery({
    queryKey: ['bookings', 'today', tenantId, date],
    queryFn: () => fetchBookingsViaProxy({ status: 'APPROVED', date }),
    initialData,
  });
}

export function useUpcomingBookings(
  from: string,
  to: string,
  initialData?: StaffBookingListResponse,
) {
  const { tenantId } = useTenant();
  return useQuery({
    queryKey: ['bookings', 'upcoming', tenantId, from, to],
    queryFn: () => fetchBookingsViaProxy({ status: 'APPROVED', from, to }),
    initialData,
  });
}
