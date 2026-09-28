import { useQuery } from '@tanstack/react-query';
import type { StaffBookingListResponse } from '@ikaro/types';
import { getBooking, listBookings, type BookingListFilters } from '@/features/booking/api/booking';
import { listAllPages } from '@/features/booking/api/list-all-pages';
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

// Fetches every page of a range/window query instead of just the first, so a window holding more
// bookings than the BFF's per-page cap (default 20 here — the proxy never sets an explicit
// `limit`) never silently loses its last-sorted rows. The `/api/bookings` route already forwards
// arbitrary query params 1:1 to the BFF, so `page` needs no route change.
async function fetchAllBookingsViaProxy(
  params: Record<string, string>,
): Promise<StaffBookingListResponse> {
  return listAllPages((page) =>
    fetchBookingsViaProxy({ ...params, page: String(page), limit: '100' }),
  );
}

export function useActionNeededBookings(
  from: string,
  to: string,
  initialData?: StaffBookingListResponse,
) {
  const { tenantId } = useTenant();
  return useQuery({
    queryKey: ['bookings', tenantId, 'action-needed', from, to],
    queryFn: () => fetchAllBookingsViaProxy({ status: 'PENDING,INFO_REQUESTED', from, to }),
    initialData,
  });
}

export function useTodayBookings(date: string, initialData?: StaffBookingListResponse) {
  const { tenantId } = useTenant();
  return useQuery({
    queryKey: ['bookings', tenantId, 'today', date],
    queryFn: () => fetchAllBookingsViaProxy({ status: 'APPROVED', date }),
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
    queryFn: () => fetchAllBookingsViaProxy({ status: 'APPROVED', from, to }),
    initialData,
    enabled,
  });
}
