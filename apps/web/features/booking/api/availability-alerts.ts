import type { AvailabilityAlertResponse, CreateAvailabilityAlertRequest } from '@ikaro/types';
import { bffClient } from '@/shared/lib/api/bff-client';

// POST /availability-alerts (UC-072, customer-only) — authenticated by the httpOnly cookie, so no
// tenant header: the backend derives the customer and tenant from the forwarded actor.
export async function createAvailabilityAlert(
  payload: CreateAvailabilityAlertRequest,
): Promise<AvailabilityAlertResponse> {
  const res = await bffClient.post<AvailabilityAlertResponse>('/availability-alerts', payload);
  return res.data;
}

// DELETE /availability-alerts/:id (UC-076) — the customer cancels their own ACTIVE alert.
// Idempotent on an already-cancelled one; `409 BOOKING_ALERT_NOT_EDITABLE` when it was notified or
// expired in the meantime.
export async function cancelAvailabilityAlertAsCustomer(alertId: string): Promise<void> {
  await bffClient.delete(`/availability-alerts/${alertId}`);
}
