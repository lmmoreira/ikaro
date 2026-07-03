import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ScheduleClosureListResponse,
  ScheduleOpeningListResponse,
  StaffBookingListResponse,
} from '@ikaro/types';
import {
  createClosure,
  createOpening,
  listClosures,
  listOpenings,
  removeClosure,
  removeOpening,
  type CreateClosureRequest,
  type CreateOpeningRequest,
} from '@/features/booking/schedule/api';
import { listBookings } from '@/features/booking/api/staff';
import { SCHEDULE_BOOKING_STATUS_ALL } from '@/features/booking/model/booking-status';
import { useTenant } from '@/providers/tenant-provider';

export function useScheduleClosures(
  from: string,
  to: string,
  initialData?: ScheduleClosureListResponse,
) {
  const { tenantId } = useTenant();
  return useQuery({
    queryKey: ['schedule', 'closures', tenantId, from, to],
    queryFn: () => listClosures(from, to),
    enabled: Boolean(from && to),
    initialData,
  });
}

export function useCreateClosure() {
  const queryClient = useQueryClient();
  const { tenantId } = useTenant();
  return useMutation({
    mutationFn: (body: CreateClosureRequest) => createClosure(body),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['schedule', 'closures', tenantId] }),
  });
}

export function useRemoveClosure() {
  const queryClient = useQueryClient();
  const { tenantId } = useTenant();
  return useMutation({
    mutationFn: (id: string) => removeClosure(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['schedule', 'closures', tenantId] }),
  });
}

export function useScheduleOpenings(
  from: string,
  to: string,
  initialData?: ScheduleOpeningListResponse,
) {
  const { tenantId } = useTenant();
  return useQuery({
    queryKey: ['schedule', 'openings', tenantId, from, to],
    queryFn: () => listOpenings(from, to),
    enabled: Boolean(from && to),
    initialData,
  });
}

export function useCreateOpening() {
  const queryClient = useQueryClient();
  const { tenantId } = useTenant();
  return useMutation({
    mutationFn: (body: CreateOpeningRequest) => createOpening(body),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['schedule', 'openings', tenantId] }),
  });
}

export function useRemoveOpening() {
  const queryClient = useQueryClient();
  const { tenantId } = useTenant();
  return useMutation({
    mutationFn: (id: string) => removeOpening(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['schedule', 'openings', tenantId] }),
  });
}

export function useWeekBookings(from: string, to: string, initialData?: StaffBookingListResponse) {
  const { tenantId } = useTenant();
  return useQuery({
    queryKey: ['bookings', tenantId, 'week', from, to],
    queryFn: () => listBookings({ status: SCHEDULE_BOOKING_STATUS_ALL, from, to, limit: 100 }),
    enabled: Boolean(from && to),
    initialData,
  });
}
