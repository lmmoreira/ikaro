import type { AvailabilityResponse, AvailabilitySummaryResponse } from '@ikaro/types';
import { bffClient } from '@/shared/lib/api/bff-client';

// TD37-S04: previously called buildBffUrl() + raw fetch(), hitting NEXT_PUBLIC_BFF_URL directly
// from the browser and bypassing the same-origin /v1 gateway — inconsistent with this directory's
// own services.ts sibling, which already used bffClient for the identical public-hotsite-read
// shape. Fixed to match rather than registered as an exception (no legitimate reason for this one
// call to skip the gateway).
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
