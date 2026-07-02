import { useQuery } from '@tanstack/react-query';
import type { StaffBookingListResponse } from '@ikaro/types';
import { getBooking, listBookings, type BookingListFilters } from '@/features/booking/api/staff';
import { useTenant } from '@/providers/tenant-provider';

export function useBookings(filters?: BookingListFilters) {
  const { tenantId } = useTenant();
  return useQuery({
    queryKey: ['bookings', tenantId, 'list', filters ?? null],
    queryFn: () => listBookings(filters),
  });
}

export function useBooking(id: string) {
  const { tenantId } = useTenant();
  return useQuery({
    queryKey: ['bookings', tenantId, 'detail', id],
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
    queryKey: ['bookings', tenantId, 'action-needed', from, to],
    queryFn: () => fetchBookingsViaProxy({ status: 'PENDING,INFO_REQUESTED', from, to }),
    initialData,
  });
}

export function useTodayBookings(date: string, initialData?: StaffBookingListResponse) {
  const { tenantId } = useTenant();
  return useQuery({
    queryKey: ['bookings', tenantId, 'today', date],
    queryFn: () => fetchBookingsViaProxy({ status: 'APPROVED', date }),
    initialData,
  });
}

export function useUpcomingBookings(
  from: string,
  to: string,
  initialData?: StaffBookingListResponse,
  enabled = true,
) {
  const { tenantId } = useTenant();
  return useQuery({
    queryKey: ['bookings', tenantId, 'upcoming', from, to],
    queryFn: () => fetchBookingsViaProxy({ status: 'APPROVED', from, to }),
    initialData,
    enabled,
  });
}
