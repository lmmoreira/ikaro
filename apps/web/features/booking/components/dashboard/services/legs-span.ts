import type { ServiceLegItem } from '@ikaro/types';

/**
 * A legged service's total span: every leg's duration plus the transition gaps *between* legs.
 * A leg's `transitionGapAfterMinutes` applies before the next leg, so the last leg's never counts —
 * the same formula as the backend's `computeLegsTotalSpanMinutes`, which is also the service's
 * persisted duration.
 */
export function legsSpanMinutes(legs: readonly ServiceLegItem[]): number {
  const durations = legs.reduce((sum, leg) => sum + leg.durationMinutes, 0);
  const gaps = legs
    .slice(0, -1)
    .reduce((sum, leg) => sum + (leg.transitionGapAfterMinutes ?? 0), 0);
  return durations + gaps;
}
