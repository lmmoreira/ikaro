import type { AvailabilityResponse, AvailabilitySummaryResponse } from '@ikaro/types';
import { getPublicEnv } from '@/shared/lib/runtime-env/public-env';

export async function fetchAvailabilitySummary(
  slug: string,
  from: string,
  to: string,
  serviceIds: readonly string[],
): Promise<AvailabilitySummaryResponse> {
  const params = new URLSearchParams({ from, to, serviceIds: serviceIds.join(',') });
  const res = await fetch(
    `${getPublicEnv('NEXT_PUBLIC_BFF_URL')}/schedule/availability/summary?${params}`,
    {
      headers: { 'X-Tenant-Slug': slug },
    },
  );

  if (!res.ok) throw new Error(`Failed to fetch availability summary for slug "${slug}"`);

  return res.json() as Promise<AvailabilitySummaryResponse>;
}

export async function fetchAvailability(
  slug: string,
  date: string,
  serviceIds: readonly string[],
): Promise<AvailabilityResponse> {
  const params = new URLSearchParams({ date, serviceIds: serviceIds.join(',') });
  const res = await fetch(
    `${getPublicEnv('NEXT_PUBLIC_BFF_URL')}/schedule/availability?${params}`,
    {
      headers: { 'X-Tenant-Slug': slug },
    },
  );

  if (!res.ok) throw new Error(`Failed to fetch availability for slug "${slug}"`);

  return res.json() as Promise<AvailabilityResponse>;
}
