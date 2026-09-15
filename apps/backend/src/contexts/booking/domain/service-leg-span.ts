import { ServiceLeg } from './service-leg';

// A leg's transitionGapAfterMinutes applies before the NEXT leg (UC-052 step 2), so the final
// leg's never contributes to the total span. "Final" means the highest legIndex — the persisted/
// reloaded itinerary order (docs/13-DATABASE_SCHEMA.md § service_legs: legIndex is "order within
// the itinerary") — not whatever order the caller happened to submit the array in; setLegs()
// only rejects duplicate indexes, not out-of-order ones, so the input order can't be trusted.
// Sorts defensively rather than trusting the caller, since this is Pure/standalone so S03's
// availability engine (UC-059) can reuse it without depending on the Service aggregate.
export function computeLegsTotalSpanMinutes(legs: ServiceLeg[]): number {
  const orderedLegs = [...legs].sort((a, b) => a.legIndex - b.legIndex);
  const totalDuration = orderedLegs.reduce((sum, leg) => sum + leg.durationMinutes, 0);
  const totalGaps = orderedLegs
    .slice(0, -1)
    .reduce((sum, leg) => sum + leg.transitionGapAfterMinutes, 0);
  return totalDuration + totalGaps;
}
