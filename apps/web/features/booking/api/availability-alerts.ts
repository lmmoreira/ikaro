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
