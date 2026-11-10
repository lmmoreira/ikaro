import type { BookingItineraryLeg } from '@ikaro/types';

/** One step of a booking's itinerary: a leg, with every resource that fulfils it. */
export interface ItineraryStep {
  /** `lineId` + `legIndex`: two lines never merge, even when their legs share an index. */
  readonly key: string;
  readonly serviceName: string;
  /** Null when the service no longer has this leg (it was edited after the booking). */
  readonly legName: string | null;
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly resourceNames: readonly string[];
}

function earliest(current: string | null, next: string | null): string | null {
  if (current === null) return next;
  if (next === null) return current;
  return Date.parse(next) < Date.parse(current) ? next : current;
}

function latest(current: string | null, next: string | null): string | null {
  if (current === null) return next;
  if (next === null) return current;
  return Date.parse(next) > Date.parse(current) ? next : current;
}

function stepOf(row: BookingItineraryLeg): ItineraryStep {
  return {
    key: `${row.lineId}:${row.legIndex}`,
    serviceName: row.serviceName,
    legName: row.legName,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    resourceNames: [row.resourceName],
  };
}

function withRow(step: ItineraryStep, row: BookingItineraryLeg): ItineraryStep {
  return {
    ...step,
    startsAt: earliest(step.startsAt, row.startsAt),
    endsAt: latest(step.endsAt, row.endsAt),
    resourceNames: step.resourceNames.includes(row.resourceName)
      ? step.resourceNames
      : [...step.resourceNames, row.resourceName],
  };
}

/**
 * Folds the flat itinerary (one entry per resource of a leg) into one step per leg. Order is the
 * input order of first appearance: the backend already sorts by line, then leg, then resource
 * type, so the rows of one leg are adjacent and this never re-sorts.
 */
export function groupItineraryByLeg(itinerary: readonly BookingItineraryLeg[]): ItineraryStep[] {
  const steps = new Map<string, ItineraryStep>();
  for (const row of itinerary) {
    const key = `${row.lineId}:${row.legIndex}`;
    const existing = steps.get(key);
    steps.set(key, existing ? withRow(existing, row) : stepOf(row));
  }
  return [...steps.values()];
}
