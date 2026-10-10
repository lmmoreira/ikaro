import type {
  CreateRecurringBookingScheduleRequest,
  CreateRecurringBookingScheduleResponse,
} from '@ikaro/types';
import { bffClient } from '@/shared/lib/api/bff-client';

// UC-070 — the signed-in customer requests a recurring schedule for themself (the customer id
// comes from the JWT, never the body). 201 → ACTIVE, or PENDING_APPROVAL with the hold's end.
export async function createRecurringScheduleAsCustomer(
  body: CreateRecurringBookingScheduleRequest,
): Promise<CreateRecurringBookingScheduleResponse> {
  const res = await bffClient.post<CreateRecurringBookingScheduleResponse>(
    '/recurring-booking-schedules',
    body,
  );
  return res.data;
}

// UC-070 A2 — 200 → the schedule becomes CANCELLED and its future occurrence bookings are
// cancelled (past ones are kept). Body-less; the schedule id is the only input.
export async function endRecurringScheduleAsCustomer(scheduleId: string): Promise<void> {
  await bffClient.post(`/recurring-booking-schedules/${scheduleId}/end`);
}
