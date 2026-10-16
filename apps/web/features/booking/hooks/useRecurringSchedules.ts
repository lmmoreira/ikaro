import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  approveRecurringScheduleAsStaff,
  getRecurringSchedule,
  listPendingRecurringSchedules,
  rejectRecurringScheduleAsStaff,
} from '@/features/booking/api/recurring-booking-schedules';
import { getService } from '@/features/booking/api/services';
import { useTenant } from '@/providers/tenant-provider';

// Staff side of the recurring schedules (UC-071, M23-S13). The customer side reads the same
// endpoints on the server, so none of this is shared with it.

export function usePendingRecurringSchedules() {
  const { tenantId } = useTenant();
  return useQuery({
    queryKey: ['recurring-schedules', tenantId, 'pending'],
    queryFn: listPendingRecurringSchedules,
  });
}

export function useRecurringScheduleForStaff(scheduleId: string) {
  const { tenantId } = useTenant();
  return useQuery({
    queryKey: ['recurring-schedules', tenantId, 'detail', scheduleId],
    queryFn: () => getRecurringSchedule(scheduleId),
    enabled: Boolean(scheduleId),
  });
}

// Which resource rows the request draws come from the service's own requirements, because the
// schedule stores only the customer's picks.
export function useRecurringScheduleService(serviceId: string | undefined) {
  const { tenantId } = useTenant();
  return useQuery({
    queryKey: ['services', tenantId, 'detail', serviceId],
    queryFn: () => getService(serviceId as string),
    enabled: Boolean(serviceId),
  });
}

// Approving creates future APPROVED bookings and rejecting leaves the queue, so both refresh the
// pending list, the queue's booking sections and the day grid the Horários week view reads.
export function useInvalidateAfterDecision() {
  const queryClient = useQueryClient();
  const { tenantId } = useTenant();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['recurring-schedules', tenantId] }),
      queryClient.invalidateQueries({ queryKey: ['bookings', tenantId] }),
      queryClient.invalidateQueries({ queryKey: ['schedule', 'day-grid', tenantId] }),
    ]);
}

export function useApproveRecurringSchedule() {
  const invalidate = useInvalidateAfterDecision();
  return useMutation({
    mutationFn: (scheduleId: string) => approveRecurringScheduleAsStaff(scheduleId),
    onSuccess: invalidate,
  });
}

export function useRejectRecurringSchedule() {
  const invalidate = useInvalidateAfterDecision();
  return useMutation({
    mutationFn: (scheduleId: string) => rejectRecurringScheduleAsStaff(scheduleId),
    onSuccess: invalidate,
  });
}
