import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateRecurringBookingScheduleRequest } from '@ikaro/types';
import {
  approveRecurringScheduleAsStaff,
  createRecurringScheduleAsStaff,
  getRecurringSchedule,
  listPendingRecurringSchedules,
  rejectRecurringScheduleAsStaff,
} from '@/features/booking/api/recurring-booking-schedules';
import { getService } from '@/features/booking/api/services';
import {
  mapStaffCreateFailure,
  mapStaffCreateSuccess,
  type StaffCreateOutcome,
} from '@/features/booking/model/recurring-staff-create';
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

// UC-070, M23-S19: a staff member creates a schedule for a customer. Like the customer's own
// mutation it never rejects — every HTTP outcome is a variant of `StaffCreateOutcome`, so the form
// keeps the typed pattern. A created schedule is ACTIVE and its occurrences exist at once, so the
// Agenda's booking sections, the day grid and the schedule lists are refreshed; a refusal created
// nothing and refreshes nothing.
export function useCreateRecurringScheduleAsStaff() {
  const invalidate = useInvalidateAfterDecision();
  return useMutation<StaffCreateOutcome, never, CreateRecurringBookingScheduleRequest>({
    mutationFn: async (body) => {
      try {
        return mapStaffCreateSuccess(await createRecurringScheduleAsStaff(body));
      } catch (error) {
        return mapStaffCreateFailure(error);
      }
    },
    onSuccess: async (outcome) => {
      if (outcome.kind === 'ACTIVE') await invalidate();
    },
  });
}
