import { ServiceLeg } from './service-leg';

// A leg's transitionGapAfterMinutes applies before the NEXT leg (UC-052 step 2), so the final
// leg's never contributes to the total span. Pure/standalone so S03's availability engine
// (UC-059) can reuse it without depending on the Service aggregate.
export function computeLegsTotalSpanMinutes(legs: ServiceLeg[]): number {
  const totalDuration = legs.reduce((sum, leg) => sum + leg.durationMinutes, 0);
  const totalGaps = legs.slice(0, -1).reduce((sum, leg) => sum + leg.transitionGapAfterMinutes, 0);
  return totalDuration + totalGaps;
}
