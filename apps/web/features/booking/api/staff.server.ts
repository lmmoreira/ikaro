import 'server-only';
import type { StaffBookingDetailResponse, StaffBookingListResponse } from '@ikaro/types';
import { bffServerFetch } from '@/shared/lib/api/bff-server';
import { FetchError, parseErrorBody } from '@/shared/lib/api/errors';

export interface BookingListFilters {
  readonly status?: string;
  readonly date?: string;
  readonly from?: string;
  readonly to?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export async function listBookings(
  token: string,
  filters?: BookingListFilters,
): Promise<StaffBookingListResponse> {
  const params = new URLSearchParams();
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined) params.set(key, String(value));
    });
  }
  const query = params.toString();
  const querySuffix = query ? `?${query}` : '';
  const res = await bffServerFetch(token, `/bookings${querySuffix}`);
  if (!res.ok) throw new Error(`Failed to fetch bookings (${res.status})`);
  return res.json() as Promise<StaffBookingListResponse>;
}

export class BookingDetailFetchError extends FetchError {
  constructor(status: number, code?: string, field?: string, detail?: string) {
    super(status, code, field, detail ?? `Failed to fetch booking detail (${status})`);
    this.name = 'BookingDetailFetchError';
  }
}

export async function fetchStaffBookingDetail(
  token: string,
  id: string,
): Promise<StaffBookingDetailResponse> {
  const res = await bffServerFetch(token, `/bookings/${id}`);
  if (!res.ok) {
    const body = await parseErrorBody(res);
    throw new BookingDetailFetchError(res.status, body.code, body.field, body.detail);
  }
  return res.json() as Promise<StaffBookingDetailResponse>;
}
