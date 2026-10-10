import { useMutation } from '@tanstack/react-query';
import type { CreateRecurringBookingScheduleRequest } from '@ikaro/types';
import { createRecurringScheduleAsCustomer } from '@/features/booking/api/recurring-booking-schedules';
import {
  mapCreateFailure,
  mapCreateSuccess,
  type CreateOutcome,
} from '@/features/booking/model/recurring-schedule-form';

/**
 * Sends the pattern and resolves to the screen it lands on — every HTTP outcome is a variant of
 * `CreateOutcome`, so the mutation itself never rejects and the caller keeps its typed pattern.
 * The tenant is the BFF's business (session cookie), so there is no tenant parameter.
 */
export function useCreateRecurringSchedule() {
  return useMutation<CreateOutcome, never, CreateRecurringBookingScheduleRequest>({
    mutationFn: async (body) => {
      try {
        return mapCreateSuccess(await createRecurringScheduleAsCustomer(body));
      } catch (error) {
        return mapCreateFailure(error);
      }
    },
  });
}
