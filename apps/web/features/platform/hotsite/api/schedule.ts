import type {
  AvailabilityResponse,
  AvailabilitySummaryResponse,
  ResourceSelectionItem,
} from '@ikaro/types';
import { bffClient } from '@/shared/lib/api/bff-client';

// The booking flow's pinned picks and chosen duration (M23-S29). Both are optional: absent, the
// request is byte-identical to the one the staff reschedule page sends.
export interface AvailabilityFlowParams {
  readonly resourceSelections?: readonly ResourceSelectionItem[];
  readonly durationMinutes?: number;
}

// One comma-joined param, `<serviceId>:<legIndex or ->:<resourceType>:<resourceId>` per pick —
// the same convention as `serviceIds` (docs/14-API_CONTRACTS.md § Schedule Availability).
function encodeResourceSelections(selections: readonly ResourceSelectionItem[]): string {
  return selections
    .map(
      (pick) => `${pick.serviceId}:${pick.legIndex ?? '-'}:${pick.resourceType}:${pick.resourceId}`,
    )
    .join(',');
}

function flowQuery(flow: AvailabilityFlowParams | undefined): Record<string, string> {
  return {
    ...(flow?.resourceSelections && flow.resourceSelections.length > 0
      ? { resourceSelections: encodeResourceSelections(flow.resourceSelections) }
      : {}),
    ...(flow?.durationMinutes === undefined
      ? {}
      : { durationMinutes: String(flow.durationMinutes) }),
  };
}

// bffClient's baseURL is a hardcoded '/v1' literal — a structural same-origin guarantee, immune
// to NEXT_PUBLIC_BFF_URL ever being misconfigured as an absolute host — matching this directory's
// services.ts sibling for the identical public-hotsite-read shape.
export async function fetchAvailabilitySummary(
  slug: string,
  from: string,
  to: string,
  serviceIds: readonly string[],
  flow?: AvailabilityFlowParams,
): Promise<AvailabilitySummaryResponse> {
  const params = new URLSearchParams({
    from,
    to,
    serviceIds: serviceIds.join(','),
    ...flowQuery(flow),
  });
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
  flow?: AvailabilityFlowParams,
): Promise<AvailabilityResponse> {
  const params = new URLSearchParams({
    date,
    serviceIds: serviceIds.join(','),
    ...flowQuery(flow),
  });
  const res = await bffClient.get<AvailabilityResponse>(`/schedule/availability?${params}`, {
    headers: { 'X-Tenant-Slug': slug },
  });
  return res.data;
}
