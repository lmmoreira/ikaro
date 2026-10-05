// Why a resource stays blocked after a booking line ends (UC-059): the service's own cleanup
// buffer, or the resource's own turnover. Closed list, persisted in
// booking.resource_occupancy.gap_source (a CHECK constraint mirrors it) — extend both together.
export const RESOURCE_GAP_SOURCES = ['SERVICE_BUFFER', 'RESOURCE_TURNOVER'] as const;

export type ResourceGapSource = (typeof RESOURCE_GAP_SOURCES)[number];

export interface ResourceGap {
  minutes: number;
  source: ResourceGapSource;
}

// UC-059 step 1 — the gap a flat (non-legged) line leaves on a resource is whichever is larger: the
// service's cleanup buffer or the resource's turnover, and a tie goes to the service buffer (the
// more actionable cause for a manager). null when both are 0. AvailabilityService delegates here
// (effectiveFlatGapMinutes and resolveFlatGap), so there is exactly one rule.
export function resolveGap(
  bufferAfterMinutes: number,
  turnoverMinutes: number,
): ResourceGap | null {
  const minutes = Math.max(bufferAfterMinutes, turnoverMinutes);
  if (minutes <= 0) return null;
  return {
    minutes,
    source: bufferAfterMinutes >= turnoverMinutes ? 'SERVICE_BUFFER' : 'RESOURCE_TURNOVER',
  };
}
