import type { AvailabilityResponse, AvailabilitySummaryResponse } from '@ikaro/types';
import { bffClient } from '@/shared/lib/api/bff-client';

// bffClient's baseURL is a hardcoded '/v1' literal — a structural same-origin guarantee, immune
// to NEXT_PUBLIC_BFF_URL ever being misconfigured as an absolute host — matching this directory's
// services.ts sibling for the identical public-hotsite-read shape.
export async function fetchAvailabilitySummary(
  slug: string,
  from: string,
  to: string,
  serviceIds: readonly string[],
): Promise<AvailabilitySummaryResponse> {
  const params = new URLSearchParams({ from, to, serviceIds: serviceIds.join(',') });
  const res = await bffClient.get<AvailabilitySummaryResponse>(
    `/schedule/availability/summary?${params}`,
    { headers: { 'X-Tenant-Slug': slug } },
  );
  return res.data;
}

export async function fetchAvailability(
  slug: string,
  date: string,
  serviceIds: readonly string[],
): Promise<AvailabilityResponse> {
  const params = new URLSearchParams({ date, serviceIds: serviceIds.join(',') });
  const res = await bffClient.get<AvailabilityResponse>(`/schedule/availability?${params}`, {
    headers: { 'X-Tenant-Slug': slug },
  });
  return res.data;
}
