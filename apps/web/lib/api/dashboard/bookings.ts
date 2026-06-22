import type { Address, StaffBookingDetailResponse, StaffBookingListResponse } from '@ikaro/types';
import { bffClient } from '../bff-client';

export interface BookingListFilters {
  readonly status?: string;
  readonly from?: string;
  readonly to?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export interface RejectBookingRequest {
  readonly reason: string;
}

export interface CancelBookingRequest {
  readonly reason?: string;
}

export interface RescheduleBookingRequest {
  readonly scheduledAt: string;
  readonly adminNotes?: string;
}

export interface CompleteBookingLine {
  readonly lineId: string;
  readonly actualPriceCharged: number;
}

export interface CompleteBookingRequest {
  readonly lines: readonly CompleteBookingLine[];
  readonly afterServicePhotoUrls?: readonly string[];
  readonly adminNotes?: string;
}

export interface RequestMoreInfoRequest {
  readonly message: string;
}

export interface SubmitInfoRequest {
  readonly response: string;
  readonly photoUrls?: readonly string[];
}

export interface AuthenticatedBookingRequest {
  readonly scheduledAt: string;
  readonly serviceIds: readonly string[];
  readonly pickupAddress?: Address;
  readonly beforeServicePhotoUrls?: readonly string[];
}

export interface CancelBookingResponse {
  readonly bookingId: string;
  readonly status: string;
}

export interface RescheduleBookingResponse {
  readonly bookingId: string;
  readonly status: string;
  readonly scheduledAt: string;
}

export interface CompleteBookingResponse {
  readonly bookingId: string;
  readonly status: string;
  readonly completedAt: string;
  readonly totalActualPrice: { readonly amount: number; readonly currency: string };
}

export async function listBookings(
  filters?: BookingListFilters,
): Promise<StaffBookingListResponse> {
  const res = await bffClient.get<StaffBookingListResponse>('/bookings', { params: filters });
  return res.data;
}

export async function getBooking(id: string): Promise<StaffBookingDetailResponse> {
  const res = await bffClient.get<StaffBookingDetailResponse>(`/bookings/${id}`);
  return res.data;
}

export async function approveBooking(
  id: string,
): Promise<{ bookingId: string; status: string; approvedAt: string }> {
  const res = await bffClient.patch<{ bookingId: string; status: string; approvedAt: string }>(
    `/bookings/${id}/approve`,
    {},
  );
  return res.data;
}

export async function rejectBooking(
  id: string,
  body: RejectBookingRequest,
): Promise<{ bookingId: string; status: string; rejectedAt: string }> {
  const res = await bffClient.patch<{ bookingId: string; status: string; rejectedAt: string }>(
    `/bookings/${id}/reject`,
    body,
  );
  return res.data;
}

export async function cancelBooking(
  id: string,
  body?: CancelBookingRequest,
): Promise<CancelBookingResponse> {
  const res = await bffClient.patch<CancelBookingResponse>(`/bookings/${id}/cancel`, body ?? {});
  return res.data;
}

export async function rescheduleBooking(
  id: string,
  body: RescheduleBookingRequest,
): Promise<RescheduleBookingResponse> {
  const res = await bffClient.patch<RescheduleBookingResponse>(`/bookings/${id}/reschedule`, body);
  return res.data;
}

export async function completeBooking(
  id: string,
  body: CompleteBookingRequest,
): Promise<CompleteBookingResponse> {
  const res = await bffClient.patch<CompleteBookingResponse>(`/bookings/${id}/complete`, body);
  return res.data;
}

export async function requestMoreInfo(
  id: string,
  body: RequestMoreInfoRequest,
): Promise<{ bookingId: string; status: string; infoRequestedAt: string }> {
  const res = await bffClient.patch<{
    bookingId: string;
    status: string;
    infoRequestedAt: string;
  }>(`/bookings/${id}/request-info`, body);
  return res.data;
}

export async function submitBookingInfo(
  id: string,
  body: SubmitInfoRequest,
): Promise<{ bookingId: string; status: string; infoSubmittedAt: string }> {
  const res = await bffClient.patch<{
    bookingId: string;
    status: string;
    infoSubmittedAt: string;
  }>(`/bookings/${id}/submit-info`, body);
  return res.data;
}

export async function createAuthenticatedBooking(
  body: AuthenticatedBookingRequest,
): Promise<{ bookingId: string; status: string }> {
  const res = await bffClient.post<{ bookingId: string; status: string }>(
    '/bookings/authenticated',
    body,
  );
  return res.data;
}
