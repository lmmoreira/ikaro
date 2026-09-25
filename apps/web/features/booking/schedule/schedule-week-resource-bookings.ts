import type { DayGridColumn, DayGridResponse } from '@ikaro/types';

function addBookingResourceId(
  resourceIdsByBookingId: Map<string, Set<string>>,
  bookingId: string,
  resourceId: string,
): void {
  const existing = resourceIdsByBookingId.get(bookingId);
  if (existing) {
    existing.add(resourceId);
  } else {
    resourceIdsByBookingId.set(bookingId, new Set([resourceId]));
  }
}

// Extracted from buildWeekBookingResourceIds below purely to keep its own Cognitive Complexity
// under SonarCloud's cap (S3776) — a nested loop body extracted to its own function resets the
// nesting-depth count the metric penalizes, no behavior change.
function collectColumnBookingResourceIds(
  resourceIdsByBookingId: Map<string, Set<string>>,
  column: DayGridColumn,
): void {
  for (const block of column.blocks) {
    // CLASS_SESSION blocks are unreachable before M24 (nothing generates them yet) — same
    // scope exclusion schedule-resource-columns.ts already applies.
    if (block.kind !== 'BOOKING') continue;
    addBookingResourceId(resourceIdsByBookingId, block.refId, column.resourceId);
  }
}

// Week view's own day-grid-as-lookup technique (TD44 Story 1) — the same "resourceId -> booking-id"
// reuse schedule-resource-columns.ts already established for Day view's columns board, fanned across
// every visible day instead of split into one column per resource. Only resources the manager has
// checked contribute to the lookup, even though each day-grid response always includes every active
// resource's column unconditionally (no `resourceIds` filter param on the endpoint itself).
//
// Returns resourceIds, not names — name resolution happens downstream (schedule-page-timeline-derived.ts
// already holds resourceNameById for this exact purpose on closures/openings), keeping this module
// name-agnostic like schedule-resource-columns.ts's own id-only lookup.
export function buildWeekBookingResourceIds(
  dayGridResponses: readonly DayGridResponse[],
  selectedResourceIds: ReadonlySet<string>,
): Map<string, string[]> {
  const resourceIdsByBookingId = new Map<string, Set<string>>();

  for (const response of dayGridResponses) {
    for (const column of response.columns) {
      if (!selectedResourceIds.has(column.resourceId)) continue;
      collectColumnBookingResourceIds(resourceIdsByBookingId, column);
    }
  }

  return new Map(
    [...resourceIdsByBookingId].map(([bookingId, resourceIds]) => [bookingId, [...resourceIds]]),
  );
}

// The filtering rule itself: zero checked resources = unfiltered (today's exact behavior, no
// exceptions); one or more checked = a booking shows only if the week-range lookup above found at
// least one checked resource it's assigned to. Exposed standalone so schedule-timeline.ts's
// per-day filter and this rule's own unit tests share one source of truth.
export function isBookingVisibleForResourceFilter(
  bookingId: string,
  selectedResourceIdSet: ReadonlySet<string>,
  bookingResourceNamesById: ReadonlyMap<string, readonly string[]>,
): boolean {
  return selectedResourceIdSet.size === 0 || bookingResourceNamesById.has(bookingId);
}
