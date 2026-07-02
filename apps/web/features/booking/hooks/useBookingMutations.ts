import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  approveBooking,
  cancelBooking,
  completeBooking,
  createAuthenticatedBooking,
  rejectBooking,
  requestMoreInfo,
  rescheduleBooking,
  submitBookingInfo,
  type CancelBookingRequest,
  type CompleteBookingRequest,
  type RescheduleBookingRequest,
  type SubmitInfoRequest,
  type AuthenticatedBookingRequest,
} from '@/features/booking/api/staff';
import type {
  ApproveBookingRequest,
  RejectBookingRequest,
  RequestMoreInfoRequest,
} from '@ikaro/types';
import { useTenant } from '@/providers/tenant-provider';

function useInvalidateBookings() {
  const queryClient = useQueryClient();
  const { tenantId } = useTenant();
  return () => queryClient.invalidateQueries({ queryKey: ['bookings', tenantId] });
}

export function useApproveBooking() {
  const invalidate = useInvalidateBookings();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body?: ApproveBookingRequest }) =>
      approveBooking(id, body),
    onSuccess: invalidate,
  });
}

export function useRejectBooking() {
  const invalidate = useInvalidateBookings();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: RejectBookingRequest }) =>
      rejectBooking(id, body),
    onSuccess: invalidate,
  });
}

export function useCancelBooking() {
  const invalidate = useInvalidateBookings();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body?: CancelBookingRequest }) =>
      cancelBooking(id, body),
    onSuccess: invalidate,
  });
}

export function useRescheduleBooking() {
  const invalidate = useInvalidateBookings();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: RescheduleBookingRequest }) =>
      rescheduleBooking(id, body),
    onSuccess: invalidate,
  });
}

export function useCompleteBooking() {
  const invalidate = useInvalidateBookings();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: CompleteBookingRequest }) =>
      completeBooking(id, body),
    onSuccess: invalidate,
  });
}

export function useRequestMoreInfo() {
  const invalidate = useInvalidateBookings();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: RequestMoreInfoRequest }) =>
      requestMoreInfo(id, body),
    onSuccess: invalidate,
  });
}

export function useSubmitBookingInfo() {
  const invalidate = useInvalidateBookings();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: SubmitInfoRequest }) =>
      submitBookingInfo(id, body),
    onSuccess: invalidate,
  });
}

export function useCreateAuthenticatedBooking() {
  const invalidate = useInvalidateBookings();
  return useMutation({
    mutationFn: (body: AuthenticatedBookingRequest) => createAuthenticatedBooking(body),
    onSuccess: invalidate,
  });
}
