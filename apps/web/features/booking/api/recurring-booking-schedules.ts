import { bffClient } from '@/shared/lib/api/bff-client';

// UC-070 A2 — 200 → the schedule becomes CANCELLED and its future occurrence bookings are
// cancelled (past ones are kept). Body-less; the schedule id is the only input.
export async function endRecurringScheduleAsCustomer(scheduleId: string): Promise<void> {
  await bffClient.post(`/recurring-booking-schedules/${scheduleId}/end`);
}
