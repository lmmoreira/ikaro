import type { AvailabilityResponse, AvailabilitySummaryResponse } from '@ikaro/types';
import { bffClient } from '@/shared/lib/api/bff-client';

// TD37-S04: previously called buildBffUrl() + raw fetch(). NEXT_PUBLIC_BFF_URL is set to '/v1' in
// every real environment (staging, prod, .env.example), so that call was already landing on the
// same-origin gateway in practice — not an active bypass. But the guarantee was env-var-dependent
// (buildBffUrl() falls through to whatever NEXT_PUBLIC_BFF_URL happens to be configured as), not
// structural. bffClient's baseURL is a hardcoded '/v1' literal, immune to that env var ever being
// misconfigured as an absolute host — and matches this directory's services.ts sibling for the
// identical public-hotsite-read shape.
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
