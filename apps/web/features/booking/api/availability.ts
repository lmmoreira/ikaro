import type { AvailabilityResponse } from '@ikaro/types';
import { bffClient } from '@/shared/lib/api/bff-client';

export async function fetchBookingAvailability(
  slug: string,
  date: string,
  serviceIds: readonly string[],
): Promise<AvailabilityResponse> {
  const res = await bffClient.get<AvailabilityResponse>('/schedule/availability', {
    params: { date, serviceIds: serviceIds.join(',') },
    headers: { 'X-Tenant-Slug': slug },
  });
  return res.data;
}
